import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, declareContext, defineForm, field } from "trama-forms/core";
import { remote } from "./helpers/remote.mjs";

const configuration =
  "Form configuration requires fields and optional collections/context/defaults/include/rules/form/outputs";
const undeclared = "Form context must be declared with declareContext<T>()";
const notFunction = "Form defaults must be a function of the context";
const withoutContext = "Form defaults requires a context";

test("defineForm checks keys, fields, context, defaults, and the rest in that order, including in its bound form", () => {
  for (const { defineForm: define, field: kind } of [{ defineForm, field }, remote]) {
    const fields = { deliveryDate: kind.text() };
    const valid = { fields, context: declareContext(), defaults: () => ({}) };
    for (const [config, message] of [
      [{ fields, contexts: declareContext() }, configuration],
      [{ fields, context: declareContext(), default: () => ({}) }, configuration],
      [{ fields: 5, context: {}, defaults: 5, ghost: 1 }, configuration],
      [{ fields: 5, context: {}, defaults: 5 }, "Form fields must be an object"],
      ...[{}, true, () => ({}), declareContext, null, 5, "context"].map((value) => [
        { fields, context: value, defaults: 5 },
        undeclared,
      ]),
      ...[{}, 5, "x", null, [], { deliveryDate: "2026-09-27" }].map((value) => [
        { fields, context: declareContext(), defaults: value, rules: { ghost: {} } },
        notFunction,
      ]),
      [{ fields, defaults: {} }, notFunction],
      [{ fields, defaults: () => ({}), rules: { ghost: {} } }, withoutContext],
      [{ fields, context: undefined, defaults: () => ({}) }, withoutContext],
      [{ ...valid, rules: { ghost: {} } }, 'Rules: unknown field "ghost"'],
      [{ ...valid, form: { ghost: 1 } }, 'Form section "form": unknown property "ghost"'],
      [{ ...valid, outputs: 5 }, "Form outputs must be a function"],
    ])
      assert.throws(() => define(config), { message });
  }
});

test("createSession requires the context the form declares and rejects an undeclared context", () => {
  const declared = defineForm({ context: declareContext(), fields: { note: field.text() } });
  const plain = defineForm({ fields: { note: field.text() } });
  for (const options of [undefined, {}, { context: undefined }, { initial: { note: "x" } }])
    assert.throws(() => createSession(declared, options), { message: "Form requires a context" });
  for (const value of [{}, null, 0, "", false, { mode: "edit" }])
    assert.throws(() => createSession(plain, { context: value }), {
      message: "Form declares no context",
    });
  for (const options of [undefined, {}, { context: undefined }]) createSession(plain, options);
  createSession(declared, { context: {} });
});

test("a declared context that is not an object is rejected before its data is checked", () => {
  const definition = defineForm({ context: declareContext(), fields: { note: field.text() } });
  for (const value of [null, 0, "edit", false, [], [{ mode: "edit" }], () => ({})])
    assert.throws(() => createSession(definition, { context: value }), {
      message: "Session context must be an object",
    });
  assert.throws(() => createSession(definition, { context: new Date(0) }), {
    message: "Session context must be plain data: a Date",
  });
});

test("a context containing non-plain data is reported with its path", () => {
  const definition = defineForm({ context: declareContext(), fields: { note: field.text() } });
  const cyclic = { mode: "edit" };
  cyclic.self = cyclic;
  const accessor = Object.defineProperty({ mode: "edit" }, "total", {
    get: () => assert.fail("getter ran"),
    enumerable: true,
  });
  for (const [value, detail] of [
    [{ today: new Date(0) }, 'a Date at "today"'],
    [{ format() {} }, 'a function at "format"'],
    [{ company: { since: new Date(0) } }, 'a Date at "company.since"'],
    [accessor, 'a getter at "total"'],
    [cyclic, 'a cycle at "self"'],
    [{ permissions: ["read", Symbol("write")] }, 'a symbol at "permissions[1]"'],
    [{ currency: { taxRate: Number.NaN } }, 'a non-finite number at "currency.taxRate"'],
    [{ limits: new Map() }, 'a Map at "limits"'],
  ])
    assert.throws(() => createSession(definition, { context: value }), {
      message: `Session context must be plain data: ${detail}`,
    });
  // Aliases without a cycle, arrays, null and undefined are data.
  const shared = { code: "JPY" };
  createSession(definition, {
    context: { a: shared, b: shared, list: [1, "x", true, null], none: undefined },
  });
});

// Rejects the creation of a session with the exact message.
const refuses = (definition, options, message) =>
  assert.throws(() => createSession(definition, options), { message });
const remoteFields = { customer: remote.field.async("customers"), note: remote.field.text() };

test("createSession checks the definition, scope, loader, context, and defaults in that order", () => {
  let runs = 0;
  const failing = remote.defineForm({
    context: declareContext(),
    defaults: () => {
      runs++;
      throw new Error("Missing date");
    },
    fields: remoteFields,
  });
  const date = { today: new Date(0) };
  for (const [definition, options, message] of [
    [{ ...failing }, { initial: 5 }, "Form definition must be created with defineForm"],
    [failing, { initial: 5 }, "Form with async fields requires a scope"],
    [
      failing,
      { scope: Number.NaN, loader: 5 },
      "Session scope must be a string or a finite number",
    ],
    [failing, { scope: "acme", loader: 5, context: date }, "Session loader must be a function"],
    [failing, { scope: "acme", initial: 5 }, "Form requires a context"],
    [
      failing,
      { scope: "acme", context: date, initial: 5 },
      'Session context must be plain data: a Date at "today"',
    ],
  ])
    refuses(definition, options, message);
  assert.equal(runs, 0);
  refuses(
    failing,
    { scope: "acme", context: {}, initial: 5 },
    "Form defaults: formula failed: Missing date",
  );
  assert.equal(runs, 1);
});

test("initial is checked after defaults, and undeclared context is checked after the loader and before initial", () => {
  const valid = remote.defineForm({
    context: declareContext(),
    defaults: () => ({ note: "Today" }),
    fields: remoteFields,
  });
  const plain = remote.defineForm({ fields: remoteFields });
  for (const [definition, options, message] of [
    [valid, { scope: "acme", context: {}, initial: 5 }, "Initial values must be an object"],
    [
      valid,
      { scope: "acme", context: {}, initial: { note: 5 } },
      'Field "note" (text): incompatible value 5',
    ],
    [plain, { context: {} }, "Form with async fields requires a scope"],
    [plain, { scope: "acme", loader: 5, context: {} }, "Session loader must be a function"],
    [plain, { scope: "acme", context: {}, initial: 5 }, "Form declares no context"],
  ])
    refuses(definition, options, message);
});

// A form whose defaults give the result the test sets, or fail if the context
// asks, and whose rules and output count their runs.
const failures = () => {
  const state = { runs: 0, failure: new Error("Missing date") };
  const probe = (value) => () => {
    state.runs++;
    return value;
  };
  const definition = defineForm({
    context: declareContext(),
    defaults: (current) => {
      if (current.fail) throw state.failure;
      return state.result;
    },
    fields: { deliveryDate: field.text(), quantity: field.number() },
    rules: { quantity: { value: probe(1), label: probe() } },
    outputs: ({ output }) => ({ probe: output(probe(1)) }),
  });
  const open = () => createSession(definition, { context: { fail: false } });
  return { state, definition, open };
};

test("a defaults failure names the cause and value, and createSession does not create the session", () => {
  const { state, definition, open } = failures();
  assert.throws(
    () => createSession(definition, { context: { fail: true } }),
    (error) => {
      assert.equal(error.message, "Form defaults: formula failed: Missing date");
      assert.equal(error.cause, state.failure);
      return true;
    },
  );
  for (const [value, shown] of [
    [5, "5"],
    [null, "null"],
    [undefined, "undefined"],
    ["x", '"x"'],
    [[], "[object Array]"],
    [Promise.resolve({}), "[object Promise]"],
  ]) {
    state.result = value;
    assert.throws(open, { message: `Form defaults: expected an object of values, got ${shown}` });
  }
  for (const [value, message] of [
    [{ x: 1 }, 'Form defaults: unknown field "x"'],
    [{ deliveryDate: 5 }, 'Form defaults: incompatible value 5 for text field "deliveryDate"'],
    [{ quantity: "x" }, 'Form defaults: incompatible value "x" for number field "quantity"'],
    [
      { deliveryDate: undefined },
      'Form defaults: incompatible value undefined for text field "deliveryDate"',
    ],
  ]) {
    state.result = value;
    assert.throws(open, { message });
  }
  assert.equal(state.runs, 0, "No rule or output ran");
  state.result = { deliveryDate: "2026-09-27" };
  assert.equal(open().getSnapshot().values.deliveryDate, "2026-09-27");
  assert.equal(state.runs, 3);
});

test("an async option with non-plain data in defaults names the field and path", () => {
  const definition = remote.defineForm({
    context: declareContext(),
    defaults: () => ({ customer: { value: 1, label: "Acme", since: new Date(0) } }),
    fields: { customer: remote.field.async("customers") },
  });
  assert.throws(() => createSession(definition, { scope: "acme", context: {} }), {
    message:
      'Form defaults: incompatible value for async field "customer": option must be plain data: a Date at "since"',
  });
});
