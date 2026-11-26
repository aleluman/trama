import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSession,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
} from "trama-forms/core";
import { lotParams } from "./helpers/rows-async.mjs";
import { defineForm, defineRules, sale } from "./helpers/rule-sets.mjs";

// The order of a form with rule sets: one sequence of declarations, the sets
// in the order of include and then rules, with one counter; value, onChange,
// params and query are declared once per field in the whole form.

const twice = (form, message) => assert.throws(form, { message });
const fields = {
  quantity: coreField.number({ default: 2 }),
  price: coreField.number({ default: 10 }),
  total: coreField.number(),
  note: coreField.text(),
};
const set = (rules) => coreRules({ fields, rules });

test("value, onChange, params, and query are each declared once per field across rule sets and rules", () => {
  const value = { value: () => 1 };
  const event = { onChange: () => {} };
  twice(
    () => coreForm({ fields, include: [set({ total: value }), false, set({ total: value })] }),
    'Field "total" value: declared by include[0] and include[2]',
  );
  twice(
    () => coreForm({ fields, include: [set({ quantity: event })], rules: { quantity: event } }),
    'Field "quantity" onChange: declared by include[0] and rules',
  );
  const lot = { lines: { each: { lot: { params: lotParams } } } };
  twice(
    () => defineForm({ ...sale, include: [defineRules({ ...sale, rules: lot })], rules: lot }),
    'Field "lot" of "lines" params: declared by include[0] and rules',
  );
  const query = { endpoint: "rate" };
  twice(
    () =>
      defineForm({
        ...sale,
        include: [defineRules({ ...sale, rules: { rate: { query } } })],
        rules: { rate: { query } },
      }),
    'Field "rate" query: declared by include[0] and rules',
  );
  const rowQuery = { lines: { each: { price: { query: { endpoint: "rate" } } } } };
  twice(
    () =>
      defineForm({
        ...sale,
        include: [
          defineRules({ ...sale, rules: rowQuery }),
          defineRules({ ...sale, rules: rowQuery }),
        ],
      }),
    'Field "price" of "lines" query: declared by include[0] and include[1]',
  );
  const amount = { lines: { each: { amount: { value: () => 1 } } } };
  twice(
    () =>
      defineForm({ ...sale, include: [defineRules({ ...sale, rules: amount })], rules: amount }),
    'Field "amount" of "lines" value: declared by include[0] and rules',
  );
});

const one = () => 1;
test("An undefined property declares nothing, while the same function in two rule sets counts as two declarations", () => {
  assert.doesNotThrow(() =>
    coreForm({
      fields,
      include: [
        set({ total: { value: undefined, onChange: undefined } }),
        set({ total: { value: one } }),
      ],
      rules: { total: { onChange: undefined } },
    }),
  );
  twice(
    () =>
      coreForm({
        fields,
        include: [set({ total: { value: one } }), set({ total: { value: one } })],
      }),
    'Field "total" value: declared by include[0] and include[1]',
  );
});

test("A query's params does not claim its field's params, and a header query does not claim a row query", () => {
  const each = {
    lot: {
      params: lotParams,
      query: { endpoint: "lots", params: lotParams, patch: () => {} },
    },
  };
  assert.doesNotThrow(() =>
    defineForm({
      ...sale,
      include: [
        defineRules({ ...sale, rules: { lines: { each: { lot: { params: lotParams } } } } }),
        defineRules({ ...sale, rules: { lines: { each: { lot: { query: each.lot.query } } } } }),
      ],
      rules: { rate: { query: { endpoint: "rate" } } },
    }),
  );
});

test("Between a formula from one rule set and an event from another, the last one declared in the sequence wins", () => {
  const formula = { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) };
  const event = { onChange: ({ quantity }) => ({ total: quantity === 5 ? undefined : 0 }) };
  const cases = [
    [{ include: [set({ total: formula }), set({ quantity: event })] }, 0],
    [{ include: [set({ quantity: event }), set({ total: formula })] }, 30],
    [{ include: [set({ total: formula })], rules: { quantity: event } }, 0],
    [{ include: [set({ quantity: event })], rules: { total: formula } }, 30],
  ];
  for (const [config, expected] of cases) {
    const session = createSession(coreForm({ fields, ...config }));
    session.edit("quantity", 3);
    assert.equal(session.getSnapshot().values.total, expected);
    session.edit("quantity", 5);
    assert.equal(session.getSnapshot().values.total, 50, "An undefined value does not compete");
  }
});

test("Between two events from different fields writing the same destination, the last declared wins", () => {
  const two = { a: coreField.number(), b: coreField.number(), target: coreField.text() };
  const a = { a: { onChange: () => ({ target: "a" }) } };
  const b = { b: { value: ({ a: value }) => value, onChange: () => ({ target: "b" }) } };
  const of = (rules) => coreRules({ fields: two, rules });
  for (const [config, expected] of [
    [{ include: [of(a), of(b)] }, "b"],
    [{ include: [of(b), of(a)] }, "a"],
    [{ include: [of(b)], rules: a }, "a"],
    [{ include: [of(a)], rules: b }, "b"],
  ]) {
    const session = createSession(coreForm({ fields: two, ...config }));
    session.edit("a", 1);
    assert.deepEqual(session.getSnapshot().values, { a: 1, b: 1, target: expected });
  }
});

test("One counter serves the whole sequence, so two earlier writers do not move up the first rule set's formula", () => {
  // The first set declares two writers before total; the second, the event
  // that writes total. With a counter per set, the event would take order 1
  // and lose against total, whose order is 3.
  const four = {
    a: coreField.number(),
    b: coreField.number(),
    quantity: coreField.number(),
    total: coreField.number(),
  };
  const first = coreRules({
    fields: four,
    rules: {
      a: { value: () => 1 },
      b: { value: () => 2 },
      total: { value: ({ quantity }) => (quantity ?? 0) * 10 },
    },
  });
  const second = coreRules({
    fields: four,
    rules: { quantity: { onChange: () => ({ total: -1 }) } },
  });
  const session = createSession(coreForm({ fields: four, include: [first, second] }));
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, -1);
  const inline = createSession(
    coreForm({
      fields: four,
      rules: {
        a: { value: () => 1 },
        b: { value: () => 2 },
        total: { value: ({ quantity }) => (quantity ?? 0) * 10 },
        quantity: { onChange: () => ({ total: -1 }) },
      },
    }),
  );
  inline.edit("quantity", 3);
  assert.deepEqual(session.getSnapshot().values, inline.getSnapshot().values);
});

test("An interleaved sequence with no inline counterpart follows sequence order in each mode", () => {
  // Each set writes both fields, in opposite roles: no object of rules lists
  // them in this order, since one entry groups the properties of each field.
  const two = { x: coreField.number(), y: coreField.number(), source: coreField.number() };
  const first = coreRules({
    fields: two,
    rules: {
      x: { value: ({ source }) => (source ?? 0) + 1 },
      source: { onChange: () => ({ y: 100 }) },
    },
  });
  const second = coreRules({
    fields: two,
    rules: { y: { value: ({ source }) => (source ?? 0) + 2 }, x: { onChange: () => ({ y: 7 }) } },
  });
  const forward = createSession(coreForm({ fields: two, include: [first, second] }));
  const backward = createSession(coreForm({ fields: two, include: [second, first] }));
  forward.edit("source", 1);
  backward.edit("source", 1);
  // Forward: y's formula (3rd) is declared after source's event (2nd), and x's
  // event (4th) after both, so x's write of y wins when x changes.
  assert.deepEqual(forward.getSnapshot().values, { x: 2, y: 7, source: 1 });
  // Backward: source's event (4th) is the last writer of y.
  assert.deepEqual(backward.getSnapshot().values, { x: 2, y: 100, source: 1 });
});
