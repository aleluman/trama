import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

const capitals = { ES: "Madrid", MX: "Mexico City" };
const order = defineForm({
  fields: {
    delivery: field.select({
      options: [
        { value: "shipping", label: "Shipping" },
        { value: "pickup", label: "Store pickup" },
      ],
      default: "shipping",
    }),
    country: field.select({
      options: [
        { value: "ES", label: "Spain" },
        { value: "MX", label: "Mexico" },
      ],
      default: "ES",
    }),
    city: field.text({ label: "City" }),
    quantity: field.number({ label: "Quantity", required: true }),
    confirmed: field.checkbox(),
    note: field.text({ label: "Note" }),
  },
  rules: {
    delivery: {
      states: ({ delivery }) =>
        delivery === "pickup" ? { city: { hidden: true } } : { city: { required: true } },
    },
    city: {
      label: ({ country }) => (country === "ES" ? "Municipality" : undefined),
      placeholder: ({ country }) => (country === null ? undefined : `E.g., ${capitals[country]}`),
    },
    note: { disabled: ({ confirmed }) => confirmed && "Order confirmed" },
  },
  form: {
    readOnly: { value: ({ confirmed }) => confirmed && "Confirmed", except: ["confirmed"] },
  },
});

// Every renderer records the props it committed, by name.
function recordingBinding(renders) {
  function Input(props) {
    useLayoutEffect(() => {
      renders.push(props);
    });
    return h("input", {
      name: props.name,
      value: String(props.value ?? ""),
      readOnly: props.readOnly,
      onInput: (event) => props.onChange(event.currentTarget.value),
    });
  }
  return createReactBinding({
    text: Input,
    number: Input,
    checkbox: Input,
    select: Input,
    async: Input,
  });
}
const lastOf = (renders, name) => renders.findLast((props) => props.name === name);

test("a hidden field does not render, stays subscribed, and reappears when it is no longer hidden", async () => {
  const renders = [];
  const { Field } = recordingBinding(renders);
  const session = createSession(order, { initial: { city: "Barcelona" } });
  const view = await mount(() =>
    h("div", null, h(Field, { session, name: "city" }), h(Field, { session, name: "note" })),
  );
  const city = () => view.container.querySelector('[name="city"]');
  try {
    assert.equal(city().value, "Barcelona");
    await act(() => session.edit("delivery", "pickup"));
    assert.equal(city(), null);
    await act(() => session.edit("city", "Seville"));
    assert.equal(city(), null);
    await act(() => session.edit("delivery", "shipping"));
    assert.equal(city().value, "Seville");
    assert.equal(lastOf(renders, "city").required, true);
  } finally {
    await view.unmount();
  }
});

test("the binding ignores a renderer's onChange while the field is disabled or readOnly in the current snapshot; session.edit still writes", async () => {
  const renders = [];
  const { Field } = recordingBinding(renders);
  const session = createSession(order);
  const view = await mount(() =>
    h(
      "div",
      null,
      ["note", "quantity", "confirmed"].map((name) => h(Field, { key: name, session, name })),
    ),
  );
  try {
    const editable = lastOf(renders, "note").onChange;
    await act(() => editable("Front desk"));
    assert.equal(session.getSnapshot().values.note, "Front desk");
    await act(() => session.edit("confirmed", true));
    assert.equal(lastOf(renders, "note").disabled, true);
    await act(() => editable("Captured before"));
    await act(() => lastOf(renders, "note").onChange("Disabled"));
    await act(() => lastOf(renders, "quantity").onChange(3));
    assert.deepEqual(
      [session.getSnapshot().values.note, session.getSnapshot().values.quantity],
      ["Front desk", null],
      "disabled and readOnly ignore onChange, including one captured before locking",
    );
    await act(() => lastOf(renders, "confirmed").onChange(false));
    assert.equal(session.getSnapshot().values.confirmed, false, "Lock exceptions allow edits");
    await act(() => session.edit("confirmed", true));
    await act(() => session.edit("note", "From core"));
    assert.equal(session.getSnapshot().values.note, "From core");
    const locked = lastOf(renders, "quantity").onChange;
    await act(() => session.edit("confirmed", false));
    await act(() => locked(5));
    assert.equal(
      session.getSnapshot().values.quantity,
      5,
      "A callback captured while locked can edit afterward",
    );
  } finally {
    await view.unmount();
  }
});

test("renderers receive readOnly, required, and reasons; label and placeholder come from the view or state", async () => {
  const renders = [];
  const { Field } = recordingBinding(renders);
  const session = createSession(order);
  const view = await mount(() =>
    h(
      "div",
      null,
      h(Field, { session, name: "city" }),
      h(Field, { session, name: "city", label: "Local", placeholder: "Own" }),
      h(Field, { session, name: "quantity" }),
      h(Field, { session, name: "note" }),
    ),
  );
  // Layout effects commit in tree order: the city of the state, then the local one.
  const cities = () =>
    renders
      .filter((item) => item.name === "city")
      .slice(-2)
      .map(({ label, placeholder }) => [label, placeholder]);
  try {
    assert.deepEqual(cities(), [
      ["Municipality", "E.g., Madrid"],
      ["Local", "Own"],
    ]);
    const city = renders.findLast((item) => item.name === "city" && item.label === "Municipality");
    assert.deepEqual(
      [city.required, city.readOnly, city.disabled, city.reasons],
      [true, false, false, []],
    );
    assert.equal(lastOf(renders, "quantity").required, true);
    await act(() => session.edit("country", "MX"));
    assert.deepEqual(cities(), [
      ["City", "E.g., Mexico City"],
      ["Local", "Own"],
    ]);
    await act(() => session.edit("confirmed", true));
    const note = lastOf(renders, "note");
    assert.deepEqual(
      [note.disabled, note.readOnly, note.reasons],
      [true, true, ["Order confirmed", "Confirmed"]],
    );
  } finally {
    await view.unmount();
  }
});

test("a change to reasons alone rerenders only that field", async () => {
  const renders = [];
  const { Field } = recordingBinding(renders);
  const definition = defineForm({
    fields: { reason: field.text(), note: field.text(), other: field.text() },
    rules: { note: { readOnly: ({ reason }) => (reason === "" ? true : reason) } },
  });
  const session = createSession(definition);
  const view = await mount(() =>
    h(
      "div",
      null,
      ["note", "other"].map((name) => h(Field, { key: name, session, name })),
    ),
  );
  try {
    renders.length = 0;
    await act(() => session.edit("reason", "First"));
    await act(() => session.edit("reason", "Second"));
    assert.deepEqual(
      renders.map(({ name, readOnly, reasons }) => [name, readOnly, reasons]),
      [
        ["note", true, ["First"]],
        ["note", true, ["Second"]],
      ],
    );
    renders.length = 0;
    await act(() => session.edit("other", "x"));
    await act(() => session.edit("reason", "Second"));
    assert.deepEqual(
      renders.map(({ name }) => name),
      ["other"],
    );
  } finally {
    await view.unmount();
  }
});

// Async fields come from createForms, whose defineForm takes every other type too.
const customers = endpoint.options(() => Promise.resolve({ options: [], more: false }));
const remote = createForms({ endpoints: [defineEndpoints({ customers })] });
const kinds = remote.defineForm({
  fields: {
    title: field.text(),
    amount: field.number({ placeholder: "Amount" }),
    done: field.checkbox(),
    size: field.select({ options: [{ value: 1, label: "One" }] }),
    customer: remote.field.async("customers", { placeholder: "Search" }),
  },
});
// The common props each renderer received: no field type overwrites them.
const commonProps = (renders) =>
  Object.keys(kinds.fields).map((name) => {
    const props = lastOf(renders, name);
    return [typeof props.id, props.name, typeof props.onChange];
  });
// Whether each renderer received a placeholder, which one, and the options.
const ownProps = (renders) =>
  Object.keys(kinds.fields).map((name) => {
    const props = lastOf(renders, name);
    return [name, Object.hasOwn(props, "placeholder"), props.placeholder, props.options];
  });

test("each renderer receives only the props for its type: placeholder in text, number, and async, definition options in select, and the option list in async", async () => {
  const renders = [];
  const { Field } = recordingBinding(renders);
  const session = createSession(kinds, { scope: "acme" });
  // Without types, the view can pass a placeholder to any field; text, number and async take it.
  const view = await mount(
    ({ extra }) =>
      h(
        "div",
        null,
        Object.keys(kinds.fields).map((name) => h(Field, { key: name, session, name, ...extra })),
      ),
    { extra: {} },
  );
  const { options } = kinds.fields.size;
  try {
    assert.deepEqual(ownProps(renders), [
      ["title", true, undefined, undefined],
      ["amount", true, "Amount", undefined],
      ["done", false, undefined, undefined],
      ["size", false, undefined, options],
      ["customer", true, "Search", undefined],
    ]);
    assert.equal(lastOf(renders, "size").options, options);
    assert.deepEqual(
      Object.keys(kinds.fields).map((name) => Object.hasOwn(lastOf(renders, name), "list")),
      [false, false, false, false, true],
    );
    const { list } = lastOf(renders, "customer");
    for (const key of ["open", "search", "more", "retry"])
      assert.equal(typeof list[key], "function");
    assert.deepEqual(
      commonProps(renders),
      Object.keys(kinds.fields).map((name) => ["string", name, "function"]),
    );
    await view.render({ extra: { placeholder: "" } });
    assert.deepEqual(ownProps(renders), [
      ["title", true, "", undefined],
      ["amount", true, "", undefined],
      ["done", false, undefined, undefined],
      ["size", false, undefined, options],
      ["customer", true, "", undefined],
    ]);
    await act(() => session.edit("size", 1));
    assert.equal(lastOf(renders, "size").value, 1);
    assert.equal(lastOf(renders, "size").options, options);
  } finally {
    await view.unmount();
  }
});
