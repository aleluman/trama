// oxlint-disable max-classes-per-file -- A class renderer and an Array subclass are what two tests exercise.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Component, memo, useLayoutEffect } from "react";
import { createForms, createSession, defineEndpoints, endpoint, subtype } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

const people = [{ value: 1, label: "Ada", credit: 100 }];
const catalog = defineEndpoints({
  people: endpoint.options(() => Promise.resolve({ options: people, more: false })),
});
const declared = { textarea: subtype.text(), toggle: subtype.checkbox(), search: subtype.async() };
const forms = createForms({ endpoints: [catalog], subtypes: declared });
// Other forms whose subtypes have the same names and bases.
const other = createForms({ endpoints: [catalog], subtypes: declared });
const fieldsOf = ({ field }) => ({
  title: field.text(),
  notes: field.textarea({ presentation: { rows: 4 } }),
  urgent: field.toggle({ label: "Urgent" }),
  customer: field.search("people", { presentation: { columns: ["label", "credit"] } }),
});
const invoice = forms.defineForm({
  fields: fieldsOf(forms),
  collections: {
    lines: { fields: { done: forms.field.toggle(), note: forms.field.textarea() } },
  },
});
const foreign = other.defineForm({
  fields: fieldsOf(other),
  collections: { lines: { fields: { done: other.field.toggle() } } },
});

// Each renderer records the props it committed and its key, by field name.
const recording = (registry = {}, bindingForms = forms) => {
  const renders = {};
  const recorder = (key) =>
    function Recorded(props) {
      useLayoutEffect(() => {
        (renders[props.name] ??= []).push({ key, props });
      });
      return h("output", { name: props.name }, JSON.stringify(props.value));
    };
  const keys = ["text", "checkbox", "async", "textarea", "toggle", "search"];
  const binding = createReactBinding(
    { ...Object.fromEntries(keys.map((key) => [key, recorder(key)])), ...registry },
    { forms: bindingForms },
  );
  return { ...binding, last: (name) => renders[name].at(-1), renders };
};
const header = (Field, session) =>
  h(
    "div",
    { key: "header" },
    ["title", "notes", "urgent", "customer"].map((name) => h(Field, { key: name, session, name })),
  );
const nothing = () => null;

test("each subtype uses its own renderer and receives the presentation from its definition on every render", async () => {
  const { Field, last, renders } = recording();
  const session = createSession(invoice, { scope: 1, initial: { lines: [{}] } });
  const [key] = session.getSnapshot().rows.lines;
  const view = await mount(() =>
    h("div", null, [
      header(Field, session),
      h(Field, { key: "done", row: session.row("lines", key), name: "done" }),
    ]),
  );
  assert.equal(last("title").key, "text");
  assert.equal("presentation" in last("title").props, false, "A base field has no presentation");
  assert.equal(last("notes").key, "textarea");
  assert.equal(last("notes").props.presentation, invoice.fields.notes.presentation);
  assert.equal(last("notes").props.placeholder, undefined);
  assert.equal(last("urgent").key, "toggle");
  assert.equal(last("urgent").props.label, "Urgent");
  assert.equal("presentation" in last("urgent").props, true);
  assert.equal(last("urgent").props.presentation, undefined);
  assert.equal(last("customer").key, "search");
  assert.deepEqual(last("customer").props.presentation, { columns: ["label", "credit"] });
  assert.equal(typeof last("customer").props.list.open, "function");
  assert.equal(last("done").key, "toggle");
  await act(() => session.edit("notes", "Deliver on Monday"));
  assert.equal(renders.notes.length, 2);
  assert.equal(last("notes").props.presentation, renders.notes[0].props.presentation);
  await act(() => last("urgent").props.onChange(true));
  assert.equal(session.getSnapshot().values.urgent, true);
  await view.unmount();
});

class CheckboxClass extends Component {
  render() {
    const { id, value } = this.props;
    return h("input", { id, type: "checkbox", checked: value, readOnly: true });
  }
}
test("fallback to the base is explicit: a class or memo renderer under the subtype key", async () => {
  const TextInput = memo(function TextInput({ id, value }) {
    return h("textarea", { id, value, readOnly: true });
  });
  const { Field } = recording({ toggle: CheckboxClass, textarea: TextInput });
  const session = createSession(invoice, { scope: 1, initial: { urgent: true, notes: "Hello" } });
  const view = await mount(() => header(Field, session));
  assert.equal(view.container.querySelector("input[type=checkbox]").checked, true);
  assert.equal(view.container.querySelector("textarea").value, "Hello");
  await view.unmount();
});

test("a subtype without a renderer is an error even if its base has one", async () => {
  await assert.rejects(opening(recording({ textarea: undefined }), invoice), {
    message: 'Field "notes" (subtype "textarea"): missing renderer',
  });
  const rows = recording({ toggle: undefined });
  const session = createSession(invoice, { scope: 1, initial: { lines: [{}] } });
  const [key] = session.getSnapshot().rows.lines;
  await assert.rejects(
    mount(() => h(rows.Field, { row: session.row("lines", key), name: "note" })),
    { message: 'Field "done" of "lines" (subtype "toggle"): missing renderer' },
  );
});

// Mounts a component that opens the definition with the binding.
const opening = (binding, definition) =>
  mount(() => {
    binding.useFormSession(definition, { scope: 1 });
    return null;
  });
test("a subtype field renders only with the forms from its createForms", async () => {
  const bases = createReactBinding({ text: nothing, checkbox: nothing, async: nothing });
  await assert.rejects(opening(bases, invoice), {
    message: 'Field "notes" (subtype "textarea"): pass its forms to createReactBinding',
  });
  await assert.rejects(opening(recording(), foreign), {
    message: 'Field "notes" (subtype "textarea") belongs to other forms',
  });
  const { Field } = recording();
  const session = createSession(foreign, { scope: 1, initial: { lines: [{}] } });
  const [key] = session.getSnapshot().rows.lines;
  await assert.rejects(
    mount(() => h(Field, { session, name: "title" })),
    {
      message: 'Field "notes" (subtype "textarea") belongs to other forms',
    },
  );
  await assert.rejects(
    mount(() => h(Field, { row: session.row("lines", key), name: "done" })),
    {
      message: 'Field "done" of "lines" (subtype "toggle") belongs to other forms',
    },
  );
});

test("registry keys are field types or subtypes of its forms, and those forms come from createForms", () => {
  const text = nothing;
  const cases = [
    [
      () => createReactBinding({ textareas: text }, { forms }),
      '"textareas" is neither a field type nor a subtype of forms',
    ],
    [() => createReactBinding({ textarea: text }), "textarea: invalid renderer"],
    [() => createReactBinding({ textarea: 1 }, { forms }), "textarea: invalid renderer"],
    [
      () => createReactBinding({ text }, { forms: { field: {} } }),
      "Binding forms must be returned by createForms",
    ],
    [
      () => createReactBinding({ text }, { forms, cache: true }),
      'Binding options: unknown property "cache"',
    ],
  ];
  for (const [operation, message] of cases) assert.throws(operation, { message });
});

test("the binding validates each template once through defineRules, passing only subtype fields", async () => {
  const calls = [];
  const counted = {
    field: forms.field,
    defineRules: (config) => {
      calls.push(config);
      return forms.defineRules(config);
    },
  };
  const { Field } = recording({}, counted);
  const session = createSession(invoice, { scope: 1, initial: { lines: [{}, {}, {}] } });
  const keys = session.getSnapshot().rows.lines;
  const view = await mount(() =>
    h("div", null, [
      header(Field, session),
      ...keys.map((key) => h(Field, { key, row: session.row("lines", key), name: "done" })),
    ]),
  );
  assert.deepEqual(
    calls.map((config) => Object.keys(config.fields ?? config.collections)),
    [["notes", "urgent", "customer"], ["lines"]],
  );
  assert.deepEqual(Object.keys(calls[1].collections.lines.fields), ["done", "note"]);
  await act(() => session.edit("title", "Another"));
  assert.equal(calls.length, 2);
  await view.unmount();
});

test("binding validation does not rerun methods on the options container", async () => {
  const calls = { map: 0, iterator: 0 };
  class Options extends Array {
    map(...args) {
      calls.map += 1;
      return super.map(...args);
    }
    *[Symbol.iterator]() {
      calls.iterator += 1;
      yield* super.values();
    }
  }
  const choices = createForms({ endpoints: [], subtypes: { combo: subtype.select() } });
  const options = Options.from([{ value: "a", label: "A" }]);
  const definition = choices.defineForm({ fields: { item: choices.field.combo({ options }) } });
  assert.equal(Array.isArray(definition.fields.item.options), true);
  assert.equal(Object.getPrototypeOf(definition.fields.item.options), Array.prototype);
  const before = { ...calls };
  const { Field } = createReactBinding({ combo: nothing }, { forms: choices });
  const view = await mount(() => h(Field, { session: createSession(definition), name: "item" }));
  assert.deepEqual(calls, before);
  await view.unmount();
});
