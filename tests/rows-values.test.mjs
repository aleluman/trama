import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

const sizes = [{ value: "s", label: "S" }];
// An order with lines of every synchronous field type; the lot of a free line is disabled.
const order = defineForm({
  fields: { rate: field.number({ default: 1 }), notes: field.text() },
  collections: {
    lines: {
      fields: {
        quantity: field.number({ default: 1 }),
        price: field.number(),
        size: field.select({ options: sizes }),
        gift: field.checkbox(),
        lot: field.text({ default: "L-0" }),
      },
    },
  },
  rules: { lines: { each: { lot: { disabled: ({ price }) => price === 0 && "Free" } } } },
});
const line = (values = {}) => ({
  quantity: 1,
  price: null,
  size: null,
  gift: false,
  lot: "L-0",
  ...values,
});
// Opening with the lines given fails with the message.
const opens = (lines, message) =>
  assert.throws(() => createSession(order, { initial: { lines } }), { message });
const free = (session) => session.getSnapshot().fieldStates.lines.map((row) => row.lot.disabled);

test("Opening completes each partial row with its field defaults", () => {
  const session = createSession(order, {
    initial: {
      rate: 2,
      lines: [{ quantity: 2 }, {}, { price: 3, size: "s", gift: true, lot: "A" }],
    },
  });
  assert.deepEqual(session.getSnapshot().values, {
    rate: 2,
    notes: "",
    lines: [line({ quantity: 2 }), line(), line({ price: 3, size: "s", gift: true, lot: "A" })],
  });
});

test("A session with the collection omitted from initial opens with an empty collection", () => {
  for (const options of [
    undefined,
    {},
    { initial: { rate: 2 } },
    { initial: { lines: undefined } },
    { initial: { lines: [] } },
  ]) {
    const { values, fieldStates, rows } = createSession(order, options).getSnapshot();
    assert.deepEqual([values.lines, fieldStates.lines, rows.lines], [[], [], []]);
    for (const array of [values.lines, fieldStates.lines, rows.lines])
      assert.ok(Object.isFrozen(array));
  }
});

test("An invalid row in initial prevents the session from opening and identifies the collection and row", () => {
  opens([{}, { foo: 1 }], 'Collection "lines" initial[1]: unknown field "foo"');
  // notes is a field of the header, not of a line.
  opens([{ notes: "x" }], 'Collection "lines" initial[0]: unknown field "notes"');
  opens(
    [{ quantity: "two" }],
    'Collection "lines" initial[0]: incompatible value "two" for number field "quantity"',
  );
  opens(
    [{}, {}, { size: "m" }],
    'Collection "lines" initial[2]: incompatible value "m" for select field "size"',
  );
  opens(
    [{ gift: 1 }],
    'Collection "lines" initial[0]: incompatible value 1 for checkbox field "gift"',
  );
  opens([5], 'Collection "lines" initial[0]: expected an object of field values');
  opens(5, 'Collection "lines" initial: rows must be an array');
});

test("The snapshot publishes frozen row values, keys, and states aligned in visual order", () => {
  const session = createSession(order, { initial: { lines: [{ price: 0 }, { price: 5 }, {}] } });
  const snapshot = session.getSnapshot();
  const { values, fieldStates, rows } = snapshot;
  assert.ok(Array.isArray(values.lines));
  assert.equal(rows.lines.length, 3);
  assert.equal(fieldStates.lines.length, 3);
  assert.deepEqual(
    values.lines.map((row) => row.price),
    [0, 5, null],
  );
  assert.deepEqual(free(session), [true, false, false]);
  // A record is plain data of the row, without its key.
  assert.deepEqual(Object.keys(values.lines[0]), ["quantity", "price", "size", "gift", "lot"]);
  assert.deepEqual(Object.keys(fieldStates.lines[0]), ["quantity", "price", "size", "gift", "lot"]);
  const frozen = [snapshot, values, values.lines, rows, rows.lines, fieldStates, fieldStates.lines];
  for (const object of [...frozen, ...values.lines, ...fieldStates.lines])
    assert.ok(Object.isFrozen(object));
  // Moving the free line last moves its values, its key and its states together.
  const [first] = rows.lines;
  session.move("lines", first, 2);
  const moved = session.getSnapshot();
  assert.deepEqual(moved.rows.lines, [rows.lines[1], rows.lines[2], first]);
  assert.deepEqual(
    moved.values.lines.map((row) => row.price),
    [5, null, 0],
  );
  assert.deepEqual(free(session), [false, false, true]);
  assert.equal(moved.values.lines[2], values.lines[0]);
  assert.equal(moved.fieldStates.lines[2], fieldStates.lines[0]);
});

test("Row keys are opaque strings, stable and unique across sessions of the same form and other forms", () => {
  const initial = { lines: [{}, {}] };
  const first = createSession(order, { initial });
  const second = createSession(order, { initial });
  const other = defineForm({
    fields: {},
    collections: { lines: { fields: { lot: field.text() } } },
  });
  const third = createSession(other, { initial });
  const keys = [first, second, third].flatMap((session) => session.getSnapshot().rows.lines);
  assert.equal(keys.length, 6);
  for (const key of keys) assert.equal(typeof key, "string");
  assert.equal(new Set(keys).size, 6);
  // A key is not a position, and editing or moving rows keeps it.
  const opened = first.getSnapshot().rows.lines;
  for (const key of opened) assert.ok(!["0", "1"].includes(key));
  first.row("lines", opened[0]).edit("price", 4);
  first.move("lines", opened[0], 1);
  assert.deepEqual(first.getSnapshot().rows.lines, [opened[1], opened[0]]);
  // A removed key is never given again, in this session nor in another.
  first.remove("lines", [opened[0]]);
  const [added] = first.add("lines", [{}]);
  const [elsewhere] = second.add("lines", [{}]);
  assert.equal(new Set([...keys, added, elsewhere]).size, 8);
});

test("A header edit preserves rows.lines, the values.lines array, and its records", () => {
  const session = createSession(order, { initial: { lines: [{}, { price: 0 }] } });
  const before = session.getSnapshot();
  session.edit("notes", "Urgent");
  const after = session.getSnapshot();
  assert.notEqual(after, before);
  assert.equal(after.values.notes, "Urgent");
  assert.equal(after.rows, before.rows);
  assert.equal(after.rows.lines, before.rows.lines);
  assert.equal(after.values.lines, before.values.lines);
  assert.equal(after.values.lines[0], before.values.lines[0]);
  assert.equal(after.values.lines[1], before.values.lines[1]);
  assert.equal(after.fieldStates.lines, before.fieldStates.lines);
});

test("A row edit preserves rows.lines and the records of the other rows", () => {
  const session = createSession(order, { initial: { lines: [{}, {}, {}] } });
  const before = session.getSnapshot();
  session.row("lines", before.rows.lines[1]).edit("price", 0);
  const after = session.getSnapshot();
  assert.equal(after.rows, before.rows);
  assert.equal(after.rows.lines, before.rows.lines);
  assert.notEqual(after.values.lines, before.values.lines);
  assert.ok(Object.isFrozen(after.values.lines));
  assert.equal(after.values.lines[0], before.values.lines[0]);
  assert.deepEqual(after.values.lines[1], line({ price: 0 }));
  assert.equal(after.values.lines[2], before.values.lines[2]);
  assert.equal(after.fieldStates.lines[0], before.fieldStates.lines[0]);
  assert.equal(after.fieldStates.lines[1].lot.disabled, true);
  assert.equal(after.fieldStates.lines[2], before.fieldStates.lines[2]);
  // The header keeps its values.
  assert.equal(after.values.rate, before.values.rate);
  assert.equal(after.fieldStates.rate, before.fieldStates.rate);
});

test("A form with no collections publishes rows: {} and its values and states keep their shape", () => {
  const plain = defineForm({
    fields: { notes: field.text(), quantity: field.number({ default: 1 }) },
    rules: { notes: { disabled: ({ quantity }) => quantity === 0 } },
  });
  const session = createSession(plain, { initial: { notes: "x" } });
  const opened = session.getSnapshot();
  assert.deepEqual(Object.keys(opened).toSorted(), [
    "fieldStates",
    "form",
    "queries",
    "resetVersion",
    "rows",
    "values",
  ]);
  assert.deepEqual(opened.rows, {});
  assert.ok(Object.isFrozen(opened.rows));
  assert.deepEqual(opened.values, { notes: "x", quantity: 1 });
  assert.deepEqual(Object.keys(opened.fieldStates), ["notes", "quantity"]);
  session.edit("quantity", 0);
  session.reset();
  const { values, fieldStates, rows } = session.getSnapshot();
  assert.deepEqual(rows, {});
  assert.deepEqual(Object.keys(values), ["notes", "quantity"]);
  assert.deepEqual(Object.keys(fieldStates), ["notes", "quantity"]);
});
