import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";
import { rejects, states } from "./helpers/session.mjs";

test("each field type has its own empty value and accepts only its own values", () => {
  const definition = defineForm({
    fields: {
      title: field.text(),
      amount: field.number(),
      done: field.checkbox(),
      size: field.select({ options: [{ value: 0, label: "Zero" }] }),
    },
  });
  const session = createSession(definition);
  assert.deepEqual(session.getSnapshot().values, {
    title: "",
    amount: null,
    done: false,
    size: null,
  });
  for (const [name, value] of [
    ["title", "Text"],
    ["amount", 0],
    ["amount", -1.5],
    ["amount", null],
    ["done", true],
    ["size", 0],
    ["size", null],
  ]) {
    session.edit(name, value);
    assert.equal(session.getSnapshot().values[name], value);
  }
  for (const [name, type, value] of [
    ["title", "text", null],
    ["title", "text", 1],
    ["amount", "number", "1"],
    ["amount", "number", Number.NaN],
    ["amount", "number", Infinity],
    ["done", "checkbox", 0],
    ["done", "checkbox", null],
    ["size", "select", "0"],
    ["size", "select", 1],
  ])
    rejects(
      session,
      () => session.edit(name, value),
      `Field "${name}" (${type}): incompatible value ${String(value)}`,
    );
});

test("default: undefined gives each type its empty value on opening and in toDefaults, and initial still rejects undefined", () => {
  const options = [{ value: 0, label: "Zero" }];
  const empty = { title: "", amount: null, done: false, size: null };
  const definition = defineForm({
    fields: {
      title: field.text({ default: undefined }),
      amount: field.number({ default: undefined }),
      done: { type: "checkbox", default: undefined },
      size: field.select({ options, default: undefined }),
      clear: field.checkbox(),
    },
    rules: {
      clear: {
        onChange: ({ clear }, { toDefaults }) =>
          clear ? toDefaults("title", "amount", "done", "size") : undefined,
      },
    },
  });
  const session = createSession(definition);
  const values = () => {
    const { clear: _, ...rest } = session.getSnapshot().values;
    return rest;
  };
  assert.deepEqual(values(), empty);
  const edited = { title: "Text", amount: 1, done: true, size: 0 };
  for (const [name, value] of Object.entries(edited)) session.edit(name, value);
  assert.deepEqual(values(), edited);
  session.edit("clear", true);
  assert.deepEqual(values(), empty);
  // An explicit undefined initial value is still incompatible.
  for (const [name, type] of [
    ["title", "text"],
    ["amount", "number"],
    ["done", "checkbox"],
    ["size", "select"],
  ])
    assert.throws(() => createSession(definition, { initial: { [name]: undefined } }), {
      message: `Field "${name}" (${type}): incompatible value undefined`,
    });
});

test("an inherited default does not belong to the field and is neither read nor validated", () => {
  const inherited = {
    get default() {
      throw new Error("inherited default read");
    },
  };
  const title = Object.assign(Object.create(inherited), { type: "text" });
  assert.equal(createSession(defineForm({ fields: { title } })).getSnapshot().values.title, "");
});

test("the definition rejects a placeholder outside text and number or a placeholder that is not text", () => {
  for (const [config, message] of [
    [field.checkbox({ placeholder: "Example" }), 'Field "x": checkbox fields have no placeholder'],
    [
      field.select({ options: [], placeholder: "Choose" }),
      'Field "x": select fields have no placeholder',
    ],
    [field.checkbox({ placeholder: 1 }), 'Field "x": checkbox fields have no placeholder'],
    [field.text({ placeholder: 1 }), 'Field "x": placeholder must be text'],
    [field.number({ placeholder: null }), 'Field "x": placeholder must be text'],
    [field.number({ placeholder: ["Example"] }), 'Field "x": placeholder must be text'],
  ])
    assert.throws(() => defineForm({ fields: { x: config } }), { message });
  for (const config of [field.text({ placeholder: "" }), field.number({ placeholder: "Example" })])
    assert.equal(
      states(createSession(defineForm({ fields: { x: config } }))).x.placeholder,
      config.placeholder,
    );
  // undefined is no placeholder in a definition; in rules it names a property the field lacks.
  const done = field.checkbox({ placeholder: undefined });
  assert.equal(
    Object.hasOwn(states(createSession(defineForm({ fields: { done } }))).done, "placeholder"),
    false,
  );
  assert.throws(
    () => defineForm({ fields: { done }, rules: { done: { placeholder: undefined } } }),
    { message: 'Field "done" placeholder: checkbox fields have no placeholder' },
  );
});

test("a type that is not a string is rejected even if it converts to a valid string", () => {
  for (const config of [
    { type: ["text"] },
    { type: ["text"], default: null },
    { type: ["text"], default: "Text" },
  ])
    assert.throws(() => defineForm({ fields: { title: config } }), {
      message: 'Field "title": unknown type text',
    });
  for (const type of ["toString", "constructor", "time", undefined])
    assert.throws(() => defineForm({ fields: { title: { type } } }), {
      message: `Field "title": unknown type ${type}`,
    });
});

test("field checks follow this order: type, label, placeholder, state, configuration, and default", () => {
  const duplicated = [
    { value: "a", label: "A" },
    { value: "a", label: "Another A" },
  ];
  for (const [config, message] of [
    [{ type: "time", label: 1 }, 'Field "x": unknown type time'],
    [field.checkbox({ label: 1, placeholder: "Example" }), 'Field "x": label must be text'],
    [
      field.checkbox({ placeholder: "Example", hidden: "yes" }),
      'Field "x": checkbox fields have no placeholder',
    ],
    [field.text({ placeholder: 1, hidden: "yes" }), 'Field "x": placeholder must be text'],
    [{ type: "select", options: "a", hidden: "yes" }, 'Field "x": hidden must be a boolean'],
    [{ type: "select", options: "a", default: 1 }, 'Field "x" (select): options must be an array'],
    [
      field.select({ options: [{ value: Number.NaN, label: "NaN" }], default: "z" }),
      'Field "x" (select): invalid option',
    ],
    [field.select({ options: [{ value: "s", label: 7 }] }), 'Field "x" (select): invalid option'],
    [field.select({ options: [{ value: "s" }] }), 'Field "x" (select): invalid option'],
    [field.select({ options: duplicated, default: "z" }), 'Field "x" (select): duplicate option'],
    [field.select({ options: [], default: "z" }), 'Field "x" (select): incompatible value z'],
  ])
    assert.throws(() => defineForm({ fields: { x: config } }), { message });
});

test("the definition stores a frozen copy of each field and of each select field's options", () => {
  const options = [{ value: "a", label: "A" }];
  const size = field.select({ options, default: "a" });
  const definition = defineForm({ fields: { size, title: field.text() } });
  const copy = definition.fields.size;
  for (const value of [copy, copy.options, copy.options[0], definition.fields.title])
    assert.ok(Object.isFrozen(value));
  // The author's objects stay theirs: still mutable, and their changes do not reach the definition.
  for (const value of [size, options, options[0]]) assert.equal(Object.isFrozen(value), false);
  options.push({ value: "b", label: "B" });
  options[0].label = "Changed";
  assert.deepEqual(copy.options, [{ value: "a", label: "A" }]);
  const session = createSession(definition);
  rejects(session, () => session.edit("size", "b"), 'Field "size" (select): incompatible value b');
  assert.equal(session.definition.fields.size.options, copy.options);
});

// The async type is only defined through createForms.
const remote = () =>
  createForms({
    endpoints: [
      defineEndpoints({
        customers: endpoint.options(() => Promise.resolve({ options: [], more: false })),
      }),
    ],
  });

test("the async type has null as its empty value and accepts only complete options", () => {
  const { defineForm: define, field: fields } = remote();
  const session = createSession(define({ fields: { customer: fields.async("customers") } }), {
    scope: "acme",
  });
  assert.deepEqual(session.getSnapshot().values, { customer: null });
  for (const value of [
    { value: 1, label: "Acme" },
    { value: "ES", label: "Spain", region: null },
    { value: 0, label: "" },
    null,
  ]) {
    session.edit("customer", value);
    assert.deepEqual(session.getSnapshot().values.customer, value);
  }
  for (const value of [
    1,
    "Acme",
    true,
    undefined,
    { value: 1 },
    { label: "Acme" },
    { value: Number.NaN, label: "NaN" },
    { value: Infinity, label: "Infinity" },
    { value: true, label: "Yes" },
    { value: null, label: "Null" },
    { value: 1, label: 1 },
  ])
    rejects(
      session,
      () => session.edit("customer", value),
      `Field "customer" (async): incompatible value ${String(value)}`,
    );
});

test("default: undefined gives an async field null on opening and in toDefaults, and initial still rejects undefined", () => {
  const { defineForm: define, field: fields } = remote();
  const definition = define({
    fields: {
      customer: fields.async("customers", { default: undefined }),
      clear: fields.checkbox(),
    },
    rules: {
      clear: {
        onChange: ({ clear }, { toDefaults }) => (clear ? toDefaults("customer") : undefined),
      },
    },
  });
  const session = createSession(definition, { scope: "acme" });
  assert.equal(session.getSnapshot().values.customer, null);
  session.edit("customer", { value: 1, label: "Acme" });
  session.edit("clear", true);
  assert.equal(session.getSnapshot().values.customer, null);
  assert.throws(
    () => createSession(definition, { scope: "acme", initial: { customer: undefined } }),
    { message: 'Field "customer" (async): incompatible value undefined' },
  );
});

test("an async field declares a placeholder, and its checks follow the same order as those of other types", () => {
  const { defineForm: define, field: fields } = remote();
  const searched = fields.async("customers", { placeholder: "Find customer" });
  const session = createSession(
    define({
      fields: { customer: searched },
      rules: { customer: { placeholder: ({ customer }) => customer?.label } },
    }),
    { scope: "acme" },
  );
  assert.equal(session.getSnapshot().fieldStates.customer.placeholder, "Find customer");
  for (const [config, message] of [
    [{ label: 1, placeholder: 1 }, 'Field "x": label must be text'],
    [{ placeholder: 1, hidden: "yes" }, 'Field "x": placeholder must be text'],
    [{ endpoint: "", hidden: "yes" }, 'Field "x": hidden must be a boolean'],
    [{ endpoint: "", default: 5 }, 'Field "x" (async): endpoint must be a key'],
    [{ default: 5 }, 'Field "x" (async): incompatible value 5'],
  ])
    assert.throws(
      () => define({ fields: { x: { type: "async", endpoint: "customers", ...config } } }),
      { message },
    );
});
