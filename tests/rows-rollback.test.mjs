import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { keysOf, rejects } from "./helpers/session.mjs";

const contacts = defineEndpoints({ contacts: endpoint.list(() => Promise.resolve([])) });
const { defineForm, field } = createForms({ endpoints: [contacts] });

// Each source of failure throws when the lot of the first line is its poison.
const poisonOf = (source) => `poison ${source}`;
const guard = (source, lot) => {
  if (lot === poisonOf(source)) throw new Error(`Failure ${source}`);
};
// Runs of the amount formula of every row.
let runs = 0;
const order = defineForm({
  fields: {
    probe: field.number(),
    head: field.text(),
    notes: field.text(),
    total: field.number(),
    contact: field.async("contacts"),
  },
  collections: {
    lines: {
      fields: {
        lot: field.text(),
        price: field.number(),
        amount: field.number(),
        check: field.number(),
        first: field.text(),
      },
    },
  },
  rules: {
    probe: { value: ({ lines }) => (guard("formula", lines[0]?.lot), lines.length) },
    head: {
      value: ({ lines }) => lines[0]?.lot ?? "",
      onChange: ({ head }) => guard("event", head),
    },
    notes: { disabled: ({ lines }) => (guard("state", lines[0]?.lot), false) },
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    contact: { params: ({ lines }) => (guard("params", lines[0]?.lot), { count: lines.length }) },
    lines: {
      each: {
        amount: { value: ({ price }) => (runs++, (price ?? 0) * 2) },
        check: {
          value: (_, { values }) => (
            guard("row formula", values.lines[0]?.lot),
            values.lines.length
          ),
        },
        first: {
          value: (_, { values }) => values.lines[0]?.lot ?? "",
          onChange: ({ first }) => guard("row event", first),
        },
        lot: { disabled: (_, { values }) => (guard("row state", values.lines[0]?.lot), false) },
      },
    },
  },
});

// The second line carries the poison, harmless while it is not the first.
const open = (poison) =>
  createSession(order, {
    scope: "acme",
    initial: {
      lines: [
        { lot: "a", price: 1 },
        { lot: poison, price: 2 },
        { lot: "c", price: 3 },
      ],
    },
  });
const handlesOf = (session) => keysOf(session).map((key) => session.row("lines", key));
const same = (actual, expected) => actual.map((item, index) => item === expected[index]);

// Valid operations through the handles of the three opening lines, observed
// without keys, which differ between sessions. The poisoned line never goes first.
const follow = (session, handles) => {
  const keys = handles.map((handle) => handle.key);
  runs = 0;
  const [added] = session.add("lines", [{ lot: "d", price: 4 }], { at: 1 });
  session.move("lines", keys[2], 0);
  session.patch({ notes: "end", lines: { [keys[0]]: { price: 5 }, [added]: { lot: "e" } } });
  handles[1].edit("price", 7);
  session.remove("lines", [keys[0]]);
  handles[2].edit("lot", "f");
  const { values, fieldStates, rows } = session.getSnapshot();
  const names = new Map([...keys.map((key, index) => [key, index]), [added, "new"]]);
  return {
    values,
    fieldStates,
    rows: rows.lines.map((key) => names.get(key)),
    handles: handles.map((handle) => handle.getSnapshot()?.values),
    runs,
  };
};

const sources = [
  ["formula", "a header formula", () => 'Field "probe" value: formula failed'],
  ["event", "a header event", () => 'Field "head" onChange: event failed'],
  ["state", "a state formula", () => 'Field "notes" disabled: formula failed'],
  ["params", "an async field's params", () => 'Field "contact" params: formula failed'],
  [
    "row formula",
    "a row formula",
    (key) => `Field "check" of "lines" row "${key}" value: formula failed`,
  ],
  [
    "row event",
    "a row event",
    (key) => `Field "first" of "lines" row "${key}" onChange: event failed`,
  ],
  [
    "row state",
    "a row state formula",
    (key) => `Field "lot" of "lines" row "${key}" disabled: formula failed`,
  ],
];
// Each command puts the poisoned lot first; the row that fails first, in
// creation order, is the first line unless the command removes it.
const commands = [
  ["add", (session, keys, lot) => session.add("lines", [{ lot, price: 9 }], { at: 0 }), 0],
  ["remove", (session, keys) => session.remove("lines", [keys[0]]), 1],
  ["move", (session, keys) => session.move("lines", keys[1], 0), 0],
  [
    "patch",
    (session, keys, lot) => session.patch({ notes: "n", lines: { [keys[0]]: { lot } } }),
    0,
  ],
];

for (const [source, description, label] of sources)
  for (const [command, attempt, failing] of commands)
    test(`When ${command} fails because of ${description}, it leaves no trace and subsequent operations behave as if it were never attempted`, () => {
      const poison = poisonOf(source);
      const session = open(poison);
      const keys = keysOf(session);
      const handles = handlesOf(session);
      const snapshots = handles.map((handle) => handle.getSnapshot());
      const message = `${label(keys[failing])}: Failure ${source}`;
      rejects(session, () => attempt(session, keys, poison), message);
      assert.deepEqual(same(handlesOf(session), handles), [true, true, true]);
      const after = handles.map((handle) => handle.getSnapshot());
      assert.deepEqual(same(after, snapshots), [true, true, true]);
      const control = open(poison);
      assert.deepEqual(follow(session, handles), follow(control, handlesOf(control)));
    });

test("remove is transactional, so if a header reader fails without the row, the row and its handle keep working", () => {
  const definition = defineForm({
    fields: { total: field.number() },
    collections: { lines: { fields: { price: field.number() } } },
    rules: {
      total: {
        value: ({ lines }) => {
          if (lines.length === 0) throw new Error("The order needs lines");
          return lines.reduce((sum, line) => sum + (line.price ?? 0), 0);
        },
      },
    },
  });
  const session = createSession(definition, { initial: { lines: [{ price: 2 }] } });
  const [key] = keysOf(session);
  const handle = session.row("lines", key);
  const snapshot = handle.getSnapshot();
  const message = 'Field "total" value: formula failed: The order needs lines';
  rejects(session, () => session.remove("lines", [key]), message);
  assert.equal(session.row("lines", key), handle);
  assert.equal(handle.getSnapshot(), snapshot);
  handle.edit("price", 5);
  assert.deepEqual([session.getSnapshot().values.total, handle.getSnapshot().values.price], [5, 5]);
  // An added line keeps its handle too, which no baseline protects.
  const [added] = session.add("lines", [{ price: 1 }]);
  const addedHandle = session.row("lines", added);
  rejects(session, () => session.remove("lines", [key, added]), message);
  assert.equal(session.row("lines", added), addedHandle);
  // With another line, the same remove commits and only then retires the handle.
  session.remove("lines", [key]);
  assert.deepEqual([session.getSnapshot().values.total, handle.getSnapshot()], [1, undefined]);
  const removed = `Collection "lines": row "${key}" was removed`;
  assert.throws(() => handle.edit("price", 1), { message: removed });
});
