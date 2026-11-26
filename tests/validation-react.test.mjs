import assert from "node:assert/strict";
import { test } from "node:test";
import { Profiler } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, bindingOf, createElement as h, last, mount } from "./helpers/react.mjs";

// The renderers receive the errors visible by the policy of their binding,
// the warnings, dirty and onBlur, which touches. With "touched", the local
// errors of a field show once it is touched or after an attempt of its scope;
// with "attempted", only after the attempt. Validation counts all the same.
const order = defineForm({
  fields: {
    customer: field.text({ required: true }),
    note: field.text(),
    discount: field.number(),
  },
  collections: { lines: { fields: { amount: field.number({ required: true }) } } },
  rules: {
    note: { warning: ({ note }) => note === "" && "No note" },
    discount: { error: ({ discount }) => (discount ?? 0) > 50 && "High discount" },
  },
});

const visible = (renders, name) => last(renders, name).errors;

const header = (Field, session) =>
  h(
    "div",
    null,
    h(Field, { session, name: "customer" }),
    h(Field, { session, name: "note" }),
    h(Field, { session, name: "discount" }),
  );

test("the props include visible errors, warnings, dirty, and onBlur; a local error stays hidden until the field is touched", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(order, { initial: { note: "" } });
  const view = await mount(() => header(Field, session));
  try {
    const customer = last(renders, "customer");
    assert.deepEqual([customer.errors, customer.warnings, customer.dirty], [[], [], false]);
    assert.equal(typeof customer.onBlur, "function");
    assert.equal(typeof customer.onInputError, "function");
    // The validation counts the hidden error.
    assert.equal(session.getSnapshot().form.errorCount, 1);
    // Warnings show always.
    assert.deepEqual(last(renders, "note").warnings, ["No note"]);
    await act(() => {
      customer.onBlur();
    });
    assert.deepEqual(visible(renders, "customer"), ["Required"]);
    assert.equal(session.getSnapshot().fieldStates.customer.touched, true);
    await act(() => {
      last(renders, "discount").onChange(60);
    });
    assert.deepEqual(visible(renders, "discount"), []);
    assert.equal(last(renders, "discount").dirty, true);
    // An error resolved after touching leaves.
    await act(() => {
      last(renders, "customer").onChange("Ana");
    });
    assert.deepEqual(visible(renders, "customer"), []);
  } finally {
    await view.unmount();
  }
});

test("an attempt reveals errors on mounted invalid fields only, and only those fields rerender", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(order, { initial: { discount: 60 } });
  // A Profiler around each Field counts the Field, not only its renderer.
  const fields = [];
  const profiled = (name) =>
    h(
      Profiler,
      { key: name, id: name, onRender: (id) => fields.push(id) },
      h(Field, { session, name }),
    );
  const view = await mount(() =>
    h(
      "div",
      null,
      ["customer", "note", "discount"].map((name) => profiled(name)),
    ),
  );
  try {
    const before = renders.length;
    const mounted = fields.length;
    await act(() => session.prepare());
    const after = renders.slice(before).map((props) => props.name);
    assert.deepEqual(after.toSorted(), ["customer", "discount"]);
    assert.deepEqual(fields.slice(mounted).toSorted(), ["customer", "discount"]);
    assert.deepEqual(visible(renders, "customer"), ["Required"]);
    assert.deepEqual(visible(renders, "discount"), ["High discount"]);
    // Reset clears the attempt and the marks: the errors hide again.
    await act(() => {
      session.reset();
    });
    assert.deepEqual(visible(renders, "customer"), []);
  } finally {
    await view.unmount();
  }
});

test("a cell shows its errors with its row's attempt; a new row does not inherit the attempt", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(order, { initial: { customer: "Ana", lines: [{}] } });
  // Each cell is labeled with the key of its row.
  const Rows = () =>
    h(
      "div",
      null,
      session
        .getSnapshot()
        .rows.lines.map((key) =>
          h(Field, { key, row: session.row("lines", key), name: "amount", label: key }),
        ),
    );
  const cell = (key) => renders.findLast((props) => props.label === key);
  const view = await mount(Rows);
  try {
    const [first] = session.getSnapshot().rows.lines;
    assert.deepEqual(cell(first).errors, []);
    await act(() => session.prepare());
    assert.deepEqual(cell(first).errors, ["Required"]);
    let added;
    await act(() => {
      [added] = session.add("lines", [{}]);
    });
    await view.render();
    // The new row has the same error, hidden until it is touched.
    assert.equal(session.row("lines", added).getSnapshot().errorCount, 1);
    assert.deepEqual(cell(added).errors, []);
    await act(() => {
      cell(added).onBlur();
    });
    assert.deepEqual(cell(added).errors, ["Required"]);
    assert.equal(session.row("lines", added).getSnapshot().touched, true);
    assert.equal(session.row("lines", first).getSnapshot().touched, false);
  } finally {
    await view.unmount();
  }
});

test("with showErrors set to attempted, the attempt shows errors and touching alone does not", async () => {
  const renders = [];
  const { Field } = bindingOf(renders, { showErrors: "attempted" });
  const session = createSession(order);
  const view = await mount(() => header(Field, session));
  try {
    await act(() => {
      last(renders, "customer").onBlur();
    });
    assert.equal(session.getSnapshot().fieldStates.customer.touched, true);
    assert.deepEqual(visible(renders, "customer"), []);
    await act(() => session.prepare());
    assert.deepEqual(visible(renders, "customer"), ["Required"]);
  } finally {
    await view.unmount();
  }
});

test("two bindings with different policies present the same session in their own way", async () => {
  const touched = [];
  const attempted = [];
  const first = bindingOf(touched);
  const second = bindingOf(attempted, { showErrors: "attempted" });
  const session = createSession(order);
  const view = await mount(() =>
    h(
      "div",
      null,
      h(first.Field, { session, name: "customer" }),
      h(second.Field, { session, name: "customer" }),
    ),
  );
  try {
    await act(() => {
      session.touch("customer");
    });
    assert.deepEqual(
      [visible(touched, "customer"), visible(attempted, "customer")],
      [["Required"], []],
    );
  } finally {
    await view.unmount();
  }
});

test("commit preserves the marks and the visible errors they reveal", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(order, { initial: { customer: "Ana" } });
  const view = await mount(() => header(Field, session));
  try {
    const sent = await act(() => session.prepare());
    await act(() => {
      last(renders, "customer").onChange("");
    });
    assert.deepEqual(visible(renders, "customer"), ["Required"]);
    await act(() => {
      session.commit(sent);
    });
    assert.deepEqual(visible(renders, "customer"), ["Required"]);
  } finally {
    await view.unmount();
  }
});

test("createReactBinding checks showErrors", () => {
  for (const showErrors of ["always", null, true])
    assert.throws(() => createReactBinding({}, { showErrors }), {
      message: 'createReactBinding: showErrors must be "touched" or "attempted"',
    });
  assert.doesNotThrow(() => createReactBinding({}, { showErrors: undefined }));
});
