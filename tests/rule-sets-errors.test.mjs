import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
} from "trama-forms/core";
import { inventory } from "./helpers/rows-async.mjs";
import { defineRules, field } from "./helpers/rule-sets.mjs";

// The checks of defineRules, which run when it is called, and those of the
// shape of include: each message names the rule set or the element of include.

const configuration =
  "Rule set configuration requires rules and optional fields/collections/context";
const rejected = (config, message, define = coreRules) =>
  assert.throws(() => define(config), { message });

test("defineRules rejects configuration that is not an object or has other sections", () => {
  for (const config of [
    undefined,
    null,
    1,
    [],
    { rules: {}, form: {} },
    { rules: {}, include: [] },
  ])
    rejected(config, configuration);
});

test("defineRules requires rules as an object keyed by field", () => {
  for (const rules of [undefined, null, [], () => ({}), 1])
    rejected({ rules }, "Rule set rules must be an object keyed by field");
  rejected(
    { fields: { note: coreField.text() } },
    "Rule set rules must be an object keyed by field",
  );
});

test("defineRules validates its fields and collections the same way as defineForm", () => {
  rejected({ fields: 1, rules: {} }, "Rule set fields must be an object");
  rejected({ fields: [], rules: {} }, "Rule set fields must be an object");
  // null is not a missing section: it is checked, before the rules.
  rejected({ fields: null, rules: {} }, "Rule set fields must be an object");
  rejected({ fields: null, rules: 1 }, "Rule set fields must be an object");
  rejected(
    { fields: { note: { type: "text", label: 1 } }, rules: {} },
    'Field "note": label must be text',
  );
  rejected(
    { fields: { 0: coreField.text() }, rules: {} },
    'Field "0": names that JavaScript orders as indices are not allowed',
  );
  rejected(
    { collections: [], rules: {} },
    "Rule set collections must be an object keyed by collection",
  );
  rejected({ collections: { lines: {} }, rules: {} }, 'Collection "lines" must declare fields');
  rejected(
    { fields: { lines: coreField.text() }, collections: { lines: { fields: {} } }, rules: {} },
    'Name "lines" is declared in fields and collections',
  );
  rejected(
    { collections: { lines: { fields: { amount: { type: "time" } } } }, rules: {} },
    'Field "amount" of "lines": unknown type time',
  );
});

test("The core defineRules rejects async fields and queries with its own message", () => {
  const { field: bound } = createForms({ endpoints: [inventory] });
  rejected(
    { fields: { product: bound.async("products") }, rules: {} },
    'Field "product" (async): define the rule set with the defineRules of createForms',
  );
  rejected(
    { collections: { lines: { fields: { product: bound.async("products") } } }, rules: {} },
    'Field "product" of "lines" (async): define the rule set with the defineRules of createForms',
  );
  rejected(
    { fields: { price: coreField.number() }, rules: { price: { query: { endpoint: "rate" } } } },
    'Field "price" query: define the rule set with the defineRules of createForms',
  );
});

test("The defineRules from createForms resolves endpoints in its registry", () => {
  rejected(
    { fields: { product: { type: "async", endpoint: "nope" } }, rules: {} },
    'Field "product" (async): unknown endpoint "nope"',
    defineRules,
  );
  rejected(
    { fields: { price: field.number() }, rules: { price: { query: { endpoint: "products" } } } },
    'Field "price" query: endpoint "products" is paged; use a value or list endpoint',
    defineRules,
  );
  rejected(
    {
      fields: { price: field.number() },
      rules: { price: { query: { endpoint: "rate", patch: 1 } } },
    },
    'Field "price" query: patch must be a function',
    defineRules,
  );
});

test("defineRules requires context declared with declareContext", () => {
  for (const context of [{}, { sent: false }, () => ({})])
    rejected({ context, rules: {} }, "Rule set context must be declared with declareContext<T>()");
});

test("A rule set's rules are validated against its requirements and keep their property labels", () => {
  const fields = { note: coreField.text(), flag: coreField.checkbox() };
  const collections = { lines: { fields: { amount: coreField.number() } } };
  for (const [rules, message] of [
    [{ missing: {} }, 'Rule set rules: unknown field "missing"'],
    [
      { lines: { each: { missing: {} } } },
      'Rule set rules of collection "lines" each: unknown field "missing"',
    ],
    [{ lines: { rows: {} } }, 'Rule set rules of collection "lines": unknown property "rows"'],
    [
      { lines: 1 },
      'Rule set rules of collection "lines": expected an object with each, row or collection',
    ],
    [
      { lines: { each: [] } },
      'Rule set rules of collection "lines" each: expected an object keyed by field',
    ],
    [{ note: 1 }, 'Field "note" rules: expected an object of properties'],
    [{ note: { size: () => 1 } }, 'Field "note" rules: unknown property "size"'],
    [
      { flag: { placeholder: () => "" } },
      'Field "flag" placeholder: checkbox fields have no placeholder',
    ],
    [{ note: { params: () => ({}) } }, 'Field "note" params: text fields have no params'],
    [{ note: { label: [() => ""] } }, 'Field "note" label: formula must be a function'],
    [{ note: { hidden: [() => true, 1] } }, 'Field "note" hidden[1]: formula must be a function'],
    [{ note: { onChange: 1 } }, 'Field "note" onChange: event must be a function'],
    [
      { lines: { each: { amount: { value: 1 } } } },
      'Field "amount" of "lines" value: formula must be a function',
    ],
  ])
    rejected({ fields, collections, rules }, message);
});

test("defineForm accepts include among its sections", () => {
  assert.throws(() => coreForm({ fields: {}, sets: [] }), {
    message:
      "Form configuration requires fields and optional collections/context/defaults/include/rules/form/outputs",
  });
});

test("include is an array that skips false, null, undefined, and holes", () => {
  const fields = { note: coreField.text() };
  const hidden = coreRules({ fields, rules: { note: { hidden: () => true } } });
  for (const include of [{}, hidden, "include", 1])
    assert.throws(() => coreForm({ fields, include }), {
      message: "Form include must be an array of rule sets",
    });
  const holed = [];
  holed[1] = hidden;
  for (const include of [undefined, [], [false, null, undefined], holed, [false, hidden, null]])
    assert.doesNotThrow(() => coreForm({ fields, include }));
});

test("An item that is not a rule set is rejected with its position, even when it is 0, an empty string, or true", () => {
  const fields = { note: coreField.text() };
  const valid = coreRules({ rules: {} });
  for (const value of [0, "", true, {}, Object.freeze({}), { ...valid }, [valid], () => valid])
    assert.throws(() => coreForm({ fields, include: [valid, false, value] }), {
      message: "Form include[2]: expected a rule set, false, null or undefined",
    });
});

test("A repeated rule set is an error that names its first position even if it declares nothing unique", () => {
  const fields = { note: coreField.text() };
  const empty = coreRules({ rules: {} });
  const hidden = coreRules({ fields, rules: { note: { hidden: () => true } } });
  assert.throws(() => coreForm({ fields, include: [empty, empty] }), {
    message: "Form include[1]: repeats the rule set of include[0]",
  });
  assert.throws(() => coreForm({ fields, include: [hidden, empty, false, hidden] }), {
    message: "Form include[3]: repeats the rule set of include[0]",
  });
});

test("Mutating the include array after definition leaves the form unchanged", () => {
  const fields = { note: coreField.text() };
  const include = [coreRules({ fields, rules: { note: { hidden: () => true } } })];
  const definition = coreForm({ fields, include });
  include.push(coreRules({ fields, rules: { note: { required: () => true } } }));
  include[0] = false;
  const { hidden, required } = createSession(definition).getSnapshot().fieldStates.note;
  assert.deepEqual([hidden, required], [true, false]);
});
