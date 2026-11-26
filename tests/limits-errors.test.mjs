import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const integer = "a non-negative integer";
const finite = "a finite number";
const civil = "a civil date YYYY-MM-DD";

test("the definition validates each limit's domain, disallows null, and requires min not to exceed max", () => {
  for (const [definition, message] of [
    [field.number({ decimals: -1 }), `Field "x" (number): decimals must be ${integer}`],
    [field.number({ decimals: 1.5 }), `Field "x" (number): decimals must be ${integer}`],
    [field.number({ decimals: "2" }), `Field "x" (number): decimals must be ${integer}`],
    [field.number({ decimals: null }), `Field "x" (number): decimals must be ${integer}`],
    [field.number({ min: Number.NaN }), `Field "x" (number): min must be ${finite}`],
    [field.number({ max: Infinity }), `Field "x" (number): max must be ${finite}`],
    [field.number({ min: null }), `Field "x" (number): min must be ${finite}`],
    [field.number({ max: "10" }), `Field "x" (number): max must be ${finite}`],
    [field.date({ min: "2026-02-30" }), `Field "x" (date): min must be ${civil}`],
    [field.date({ max: null }), `Field "x" (date): max must be ${civil}`],
    [field.date({ max: 20260101 }), `Field "x" (date): max must be ${civil}`],
    [field.number({ min: 20, max: 10 }), 'Field "x" (number): min 20 exceeds max 10'],
    [
      field.date({ min: "2026-05-01", max: "2026-04-01" }),
      'Field "x" (date): min "2026-05-01" exceeds max "2026-04-01"',
    ],
    [field.text({ min: 1 }), 'Field "x": text fields have no min'],
    [field.date({ decimals: 2 }), 'Field "x": date fields have no decimals'],
    [field.checkbox({ max: true }), 'Field "x": checkbox fields have no max'],
    [{ type: "select", options: [], min: null }, 'Field "x": select fields have no min'],
  ])
    assert.throws(() => defineForm({ fields: { x: definition } }), { message });
  for (const definition of [
    field.number({ min: 5, max: 5, decimals: 0 }),
    field.date({ min: "2026-04-01", max: "2026-04-01" }),
    field.text({ min: undefined }),
  ])
    defineForm({ fields: { x: definition } });
  assert.throws(
    () =>
      defineForm({
        fields: {},
        collections: { lines: { fields: { price: field.number({ min: 2, max: 1 }) } } },
      }),
    { message: 'Field "price" of "lines" (number): min 2 exceeds max 1' },
  );
});

test("a rule for a limit the type does not have or with an array of formulas is rejected at definition time", () => {
  const fields = { note: field.text(), price: field.number(), from: field.date() };
  for (const [rules, message] of [
    [{ note: { min: () => 1 } }, 'Field "note" min: text fields have no min'],
    [{ note: { max: undefined } }, 'Field "note" max: text fields have no max'],
    [{ from: { decimals: () => 2 } }, 'Field "from" decimals: date fields have no decimals'],
    [{ price: { decimals: [() => 2] } }, 'Field "price" decimals: formula must be a function'],
    [{ from: { min: [() => null] } }, 'Field "from" min: formula must be a function'],
    [{ price: { max: 10 } }, 'Field "price" max: formula must be a function'],
  ])
    assert.throws(() => defineForm({ fields, rules }), { message });
});

// A form whose rule for price returns result once trigger is "x".
const returning = (property, result, type) =>
  defineForm({
    fields: { trigger: field.text(), price: field[type](), note: field.text() },
    rules: { price: { [property]: ({ trigger }) => (trigger === "x" ? result : undefined) } },
  });

test("a limit formula with a result outside its domain rejects the operation", () => {
  const bounded = `${finite}, null or undefined`;
  for (const [property, result, type, expected] of [
    ["decimals", -1, "number", `${integer} or undefined`],
    ["decimals", null, "number", `${integer} or undefined`],
    ["decimals", 0.5, "number", `${integer} or undefined`],
    ["min", Infinity, "number", bounded],
    ["max", "10", "number", bounded],
    ["min", "2026-02-30", "date", `${civil}, null or undefined`],
    ["max", 20260101, "date", `${civil}, null or undefined`],
  ]) {
    const session = createSession(returning(property, result, type));
    const shown = typeof result === "string" ? `"${result}"` : String(result);
    rejects(
      session,
      () => session.edit("trigger", "x"),
      `Field "price" ${property}: incompatible result ${shown}, expected ${expected}`,
    );
  }
});

test("a state patch validates that the target has the limit and that the value is in its domain", () => {
  for (const [patch, message] of [
    [{ note: { min: 1 } }, 'text field "note" has no min'],
    [{ note: { decimals: undefined } }, 'text field "note" has no decimals'],
    [
      { price: { max: Infinity } },
      `incompatible max Infinity for field "price", expected ${finite}, null or undefined`,
    ],
    [
      { price: { decimals: null } },
      `incompatible decimals null for field "price", expected ${integer} or undefined`,
    ],
  ]) {
    const session = createSession(
      defineForm({
        fields: { trigger: field.text(), price: field.number(), note: field.text() },
        rules: { trigger: { states: ({ trigger }) => (trigger === "x" ? patch : undefined) } },
      }),
    );
    rejects(session, () => session.edit("trigger", "x"), `Field "trigger" states: ${message}`);
  }
});

test("a combined result with min greater than max rejects both the operation and opening", () => {
  const definition = defineForm({
    fields: {
      low: field.number(),
      price: field.number({ max: 10 }),
      from: field.date(),
      to: field.date(),
    },
    rules: {
      price: { min: ({ low }) => low ?? undefined },
      to: { min: ({ from }) => from, max: () => "2026-12-31" },
    },
  });
  const session = createSession(definition);
  rejects(session, () => session.edit("low", 20), 'Field "price" (number): min 20 exceeds max 10');
  rejects(
    session,
    () => session.edit("from", "2027-01-01"),
    'Field "to" (date): min "2027-01-01" exceeds max "2026-12-31"',
  );
  assert.throws(() => createSession(definition, { initial: { low: 11 } }), {
    message: 'Field "price" (number): min 11 exceeds max 10',
  });
  session.edit("low", 10);
  assert.equal(session.getSnapshot().fieldStates.price.min, 10);
});

test("formula errors precede combined errors, which follow field order", () => {
  const session = createSession(
    defineForm({
      fields: {
        low: field.number(),
        first: field.number({ max: 1 }),
        second: field.number({ max: 1 }),
        late: field.text(),
      },
      rules: {
        first: { min: ({ low }) => low ?? undefined },
        second: { min: ({ low }) => low ?? undefined },
        late: {
          label: ({ low }) => {
            if (low === 99) throw new Error("late failed");
          },
        },
      },
    }),
  );
  rejects(session, () => session.edit("low", 5), 'Field "first" (number): min 5 exceeds max 1');
  rejects(
    session,
    () => session.edit("low", 99),
    'Field "late" label: formula failed: late failed',
  );
});

// A number whose min is 0 the first time it is read, and 20 afterwards.
const changing = () => {
  let reads = 0;
  return {
    type: "number",
    get min() {
      reads += 1;
      return reads === 1 ? 0 : 20;
    },
    max: 10,
  };
};

test("a definition is read once, so a getter cannot pass validation with one value and store another", () => {
  const header = defineForm({ fields: { amount: changing() } });
  const rows = defineForm({
    fields: {},
    collections: { lines: { fields: { amount: changing() } } },
  });
  const opened = [
    createSession(header).getSnapshot().fieldStates.amount,
    createSession(rows, { initial: { lines: [{}] } }).getSnapshot().fieldStates.lines[0].amount,
  ];
  for (const state of opened) assert.deepEqual([state.min, state.max], [0, 10]);
  assert.equal(Object.getOwnPropertyDescriptor(header.fields.amount, "min").value, 0);
});
