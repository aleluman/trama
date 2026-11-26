import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, declareContext, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const n = (value) => field.number({ default: value });
const keys = (session) => session.getSnapshot().rows.lines;
const linesOf = (session) => session.getSnapshot().values.lines;
const column = (session, name) => linesOf(session).map((line) => line[name]);
// A form of lines with the given fields and each, declared after the header rules.
const withLines = ({ fields = {}, line, each, rules, ...rest }) => {
  const collections = { lines: { fields: line } };
  return defineForm({ ...rest, fields, collections, rules: { ...rules, lines: { each } } });
};
const tag = (key) => `P-${key}`;
// A patch of the header that writes the same fields in every line, by key.
const everyLine = (rows, written) => ({
  lines: Object.fromEntries(rows.lines.map((key) => [key, written])),
});

test("A row formula reads its row, the header, its key, and the context", () => {
  const order = withLines({
    context: declareContext(),
    fields: { rate: n(2) },
    line: { quantity: n(1), amount: field.number(), tag: field.text() },
    each: {
      amount: { value: (row, { values }) => row.quantity * values.rate },
      tag: { value: (_, { key, context }) => `${context.prefix}-${key}` },
    },
  });
  const session = createSession(order, {
    context: { prefix: "P" },
    initial: { lines: [{ quantity: 3 }, {}] },
  });
  const [first, second] = keys(session);
  assert.deepEqual(linesOf(session), [
    { quantity: 3, amount: 6, tag: tag(first) },
    { quantity: 1, amount: 2, tag: tag(second) },
  ]);
  session.edit("rate", 10);
  assert.deepEqual(column(session, "amount"), [30, 10]);
  session.row("lines", second).edit("quantity", 4);
  assert.deepEqual(column(session, "amount"), [30, 40]);
  // The key is that of the snapshot, also for a row added first and then moved.
  const [added] = session.add("lines", [{}], { at: 0 });
  session.move("lines", added, 2);
  assert.deepEqual(keys(session), [first, second, added]);
  assert.deepEqual(column(session, "tag"), [tag(first), tag(second), tag(added)]);
});

test("peek.row and peek.values read without creating dependencies, so changing what they read triggers no recalculation", () => {
  let runs = 0;
  const session = createSession(
    withLines({
      fields: { rate: n(2) },
      line: { quantity: n(1), price: n(5), amount: field.number() },
      each: {
        amount: {
          value: (row, { peek }) => (runs++, row.quantity * peek.row.price * peek.values.rate),
        },
      },
    }),
    { initial: { lines: [{}] } },
  );
  const line = session.row("lines", keys(session)[0]);
  assert.equal(linesOf(session)[0].amount, 10);
  runs = 0;
  line.edit("price", 7);
  session.edit("rate", 3);
  assert.equal(runs, 0);
  assert.equal(linesOf(session)[0].amount, 10);
  line.edit("quantity", 2);
  assert.equal(runs, 1);
  assert.equal(linesOf(session)[0].amount, 42);
});

// The total sums the amount of every line; the branch is disabled while there are lines.
const totals = withLines({
  fields: { total: field.number(), branch: field.text() },
  line: { quantity: n(1), price: n(0), amount: field.number() },
  each: { amount: { value: ({ quantity, price }) => quantity * price } },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    branch: { disabled: ({ lines }) => lines.length > 0 && "Lines are present" },
  },
});

test("A header total sums a field across all rows and recalculates on edit, add, and remove", () => {
  const session = createSession(totals, {
    initial: { lines: [{ price: 10 }, { quantity: 2, price: 5 }] },
  });
  const total = () => session.getSnapshot().values.total;
  assert.equal(total(), 20);
  const [first, second] = keys(session);
  session.row("lines", first).edit("quantity", 3);
  assert.equal(total(), 40);
  const [added] = session.add("lines", [{ quantity: 1, price: 7 }], { at: 1 });
  assert.equal(total(), 47);
  session.remove("lines", [second]);
  assert.equal(total(), 37);
  session.remove("lines", [first, added]);
  assert.equal(total(), 0);
});

test("A header state that reads lines.length tracks row membership", () => {
  const session = createSession(totals);
  const disabled = () => session.getSnapshot().fieldStates.branch.disabled;
  assert.equal(disabled(), false);
  const [key] = session.add("lines", [{}]);
  assert.equal(disabled(), true);
  session.remove("lines", [key]);
  assert.equal(disabled(), false);
});

// The depot writes the warehouse of every line, whose event clears its lot.
const depots = (line) =>
  withLines({
    fields: { depot: field.text(), summary: field.text() },
    line,
    each: { warehouse: { onChange: (_, { toDefaults }) => toDefaults("lot") } },
    rules: {
      summary: { value: ({ lines }) => lines.map((row) => row.warehouse).join(",") },
      depot: { onChange: ({ depot }, { rows }) => everyLine(rows, { warehouse: depot }) },
    },
  });
const lot = field.text({ default: "No lot" });
const warehouse = field.text();

test("A header event writes to all rows by key without creating a cycle with a rule that reads the rows", () => {
  const session = createSession(depots({ warehouse, lot }), { initial: { lines: [{}, {}] } });
  session.add("lines", [{ warehouse: "south" }], { at: 0 });
  session.edit("depot", "north");
  assert.deepEqual(column(session, "warehouse"), ["north", "north", "north"]);
  assert.equal(session.getSnapshot().values.summary, "north,north,north");
});

test("The cascade from header to rows behaves the same with lot declared before or after depot", () => {
  for (const line of [
    { lot, warehouse },
    { warehouse, lot },
  ]) {
    const session = createSession(depots(line), {
      initial: { lines: [{ lot: "L-1" }, { lot: "L-2", warehouse: "north" }] },
    });
    const [added] = session.add("lines", [{ lot: "L-3" }], { at: 0 });
    session.edit("depot", "north");
    assert.deepEqual(column(session, "warehouse"), ["north", "north", "north"]);
    // The last line already had that warehouse: its event does not run.
    assert.deepEqual(column(session, "lot"), ["No lot", "No lot", "L-2"]);
    assert.equal(keys(session)[0], added);
  }
});

test("Row toDefaults returns the row's static default and rejects a name outside the row fields", () => {
  const session = createSession(
    withLines({
      fields: { rate: n(1) },
      line: { price: n(0), lot },
      each: {
        price: { onChange: ({ price }, { toDefaults }) => toDefaults(price > 0 ? "lot" : "rate") },
      },
    }),
    { initial: { rate: 2, lines: [{ lot: "L-1" }, { lot: "L-2" }] } },
  );
  const [, key] = keys(session);
  const line = session.row("lines", key);
  // The static default, not the initial value of the row.
  line.edit("price", 5);
  assert.deepEqual(column(session, "lot"), ["L-1", "No lot"]);
  rejects(
    session,
    () => line.edit("price", -1),
    `Field "price" of "lines" row "${key}" onChange: toDefaults: unknown field "rate"`,
  );
});

test("Between a header event and a row field formula, the last one declared in rules wins", () => {
  const fields = { rate: n(1) };
  const collections = { lines: { fields: { quantity: n(2), amount: field.number() } } };
  const formula = {
    each: { amount: { value: ({ quantity }, { values }) => quantity * values.rate } },
  };
  const event = { onChange: (_, { rows }) => everyLine(rows, { amount: 0 }) };
  const open = (rules) =>
    createSession(defineForm({ fields, collections, rules }), { initial: { lines: [{}, {}] } });
  const eventLast = open({ lines: formula, rate: event });
  const formulaLast = open({ rate: event, lines: formula });
  for (const session of [eventLast, formulaLast]) session.edit("rate", 3);
  assert.deepEqual(column(eventLast, "amount"), [0, 0]);
  assert.deepEqual(column(formulaLast, "amount"), [6, 6]);
  // Only the formula writes when a quantity changes.
  for (const session of [eventLast, formulaLast])
    session.row("lines", keys(session)[0]).edit("quantity", 4);
  assert.deepEqual(column(eventLast, "amount"), [12, 0]);
  assert.deepEqual(column(formulaLast, "amount"), [12, 6]);
});

test("A row event runs when its field changes and skips added rows", () => {
  const runs = [];
  const session = createSession(
    withLines({
      line: { price: field.number(), lot: field.text() },
      each: {
        price: { onChange: ({ price }, { key }) => (runs.push(key), { lot: `P${price}` }) },
      },
    }),
    { initial: { lines: [{ price: 1 }] } },
  );
  const [first] = keys(session);
  const [added] = session.add("lines", [{ price: 2 }], { at: 0 });
  assert.deepEqual(runs, []);
  assert.deepEqual(column(session, "lot"), ["", ""]);
  session.row("lines", added).edit("price", 3);
  session.row("lines", first).edit("price", 1);
  session.move("lines", added, 1);
  session.patch({ lines: { [first]: { price: 4 } } });
  assert.deepEqual(runs, [added, first]);
  assert.deepEqual(column(session, "price"), [4, 3]);
  assert.deepEqual(column(session, "lot"), ["P4", "P3"]);
});

test("A derived line count in the header runs its event when a command changes it", () => {
  const seen = [];
  const session = createSession(
    withLines({
      fields: { count: field.number(), note: field.text() },
      line: { lot: field.text() },
      rules: {
        count: {
          value: ({ lines }) => lines.length,
          onChange: ({ count }) => (seen.push(count), { note: `${count} lines` }),
        },
      },
    }),
    { initial: { lines: [{}] } },
  );
  const [key] = session.add("lines", [{}, {}]);
  // Moving keeps the count, so its event does not run.
  session.move("lines", key, 0);
  session.remove("lines", [key]);
  assert.deepEqual(seen, [3, 2]);
  assert.equal(session.getSnapshot().values.note, "2 lines");
});

const unknownKey = (key) => `Field "rate" onChange: unknown row key "${key}" in collection "lines"`;
const unknownField = (key) =>
  `Field "rate" onChange: row "${key}" of "lines": unknown field "lott" in patch`;
// Fails with 1, and gives a text with 2.
const amountOf = (price) => {
  if (price === 1) throw new Error("Invalid price");
  return price === 2 ? "x" : price;
};

test("Failing row formulas and events name their field, collection, and row key", () => {
  const session = createSession(
    withLines({
      line: { price: n(0), amount: field.number() },
      each: {
        amount: { value: ({ price }) => amountOf(price) },
        price: { onChange: ({ price }) => (price === 3 ? { pricee: 1 } : undefined) },
      },
    }),
    { initial: { lines: [{}, {}] } },
  );
  const [, key] = keys(session);
  const line = session.row("lines", key);
  const failures = [
    [1, `Field "amount" of "lines" row "${key}" value: formula failed: Invalid price`],
    [2, `Field "amount" of "lines" row "${key}" value: incompatible result "x" for a number field`],
    [3, `Field "price" of "lines" row "${key}" onChange: unknown field "pricee" in patch`],
  ];
  for (const [price, message] of failures)
    rejects(session, () => line.edit("price", price), message);
});

test("A patch from the header to rows rejects unknown keys, non-object collections, and unknown fields", () => {
  let written;
  const definition = withLines({
    fields: { rate: field.number() },
    line: { lot: field.text() },
    rules: { rate: { onChange: () => ({ lines: written }) } },
  });
  const session = createSession(definition, { initial: { lines: [{}, {}] } });
  const [foreign] = keys(createSession(definition, { initial: { lines: [{}] } }));
  const [key, removed] = keys(session);
  session.remove("lines", [removed]);
  const notObject =
    'Field "rate" onChange: collection "lines" in patch must be an object keyed by row';
  const failures = [
    [{ [foreign]: { lot: "x" } }, unknownKey(foreign)],
    [{ [removed]: undefined }, unknownKey(removed)],
    [true, notObject],
    [[{ lot: "x" }], notObject],
    [{ [key]: { lott: "x" } }, unknownField(key)],
  ];
  for (const [index, [patch, message]] of failures.entries()) {
    written = patch;
    rejects(session, () => session.edit("rate", index + 1), message);
  }
});
