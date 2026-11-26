import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects } from "./helpers/session.mjs";

const amountOf = ({ quantity, price }, { rate }) => (quantity ?? 0) * (price ?? 0) * (rate ?? 1);
const n = (value) => field.number(value === undefined ? {} : { default: value });
// An order with lines. log records each run of the amount formula and of the
// price event, with the key of its row; each adds rules to the lines.
const order = (log = [], each = {}) =>
  defineForm({
    fields: { rate: n(1), total: n(), count: n(), first: field.text(), notes: field.text() },
    collections: {
      lines: { fields: { quantity: n(1), price: n(), amount: n(), lot: field.text(), size: n() } },
    },
    rules: {
      total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
      count: { value: ({ lines }) => lines.length },
      first: { value: ({ lines }) => lines[0]?.lot ?? "" },
      lines: {
        each: {
          amount: {
            value: (row, { values, key }) => (log.push(`amount ${key}`), amountOf(row, values)),
          },
          price: {
            onChange: (_, { key, toDefaults }) => (log.push(`price ${key}`), toDefaults("lot")),
          },
          ...each,
        },
      },
    },
  });
const open = (lines, log, each) => createSession(order(log, each), { initial: { lines } });
const lots = (session) => session.getSnapshot().values.lines.map(({ lot }) => lot);
const lettered = (...letters) => letters.map((lot) => ({ lot }));
const priced = () => [1, 2, 3, 4].map((price, index) => ({ price, lot: "abcd"[index] }));
// How many times the session notifies its subscribers during the operation.
const publications = (session, operation) => {
  let count = 0;
  const stop = session.subscribe(() => count++);
  operation();
  stop();
  return count;
};
const same = (actual, expected) => actual.map((item, index) => item === expected[index]);

test("add inserts at the end, start, or a position and returns current keys in a frozen array in order", () => {
  const session = open(lettered("a", "b"));
  const [a, b] = keysOf(session);
  const end = session.add("lines", lettered("c"));
  const start = session.add("lines", lettered("x", "y"), { at: 0 });
  const middle = session.add("lines", lettered("m"), { at: 3 });
  const last = session.add("lines", lettered("z"), { at: 6 });
  assert.deepEqual(keysOf(session), [...start, a, ...middle, b, ...end, ...last]);
  assert.deepEqual(lots(session), ["x", "y", "a", "m", "b", "c", "z"]);
  assert.equal(new Set(keysOf(session)).size, 7);
  for (const keys of [end, start, middle, last]) assert.ok(Object.isFrozen(keys));
  const given = (keys) => keys.map((key) => session.row("lines", key).getSnapshot().values.lot);
  assert.deepEqual([...given(start), ...given(middle), ...given(end)], ["x", "y", "m", "c"]);
});

test("The batch formulas see the final collection and a supplied value wins only at its own address", () => {
  const size = { value: (_, { values }) => values.lines.length };
  const session = open([{}], [], { size });
  const added = session.add("lines", [{ price: 2 }, { size: 99, price: 3, amount: 50 }, {}]);
  const { values } = session.getSnapshot();
  const shown = values.lines.map((line) => `${line.size}/${line.amount}`);
  assert.deepEqual(shown, ["4/0", "4/2", "99/50", "4/0"]);
  assert.deepEqual([values.count, values.total], [4, 52]);
  assert.deepEqual(keysOf(session).slice(1), added);
});

test("Adding at the start runs no new row events and leaves the row previously at that position intact without initializing or clearing it", () => {
  const log = [];
  const session = open([{ quantity: 2, price: 3, lot: "L1" }], log);
  const handle = session.row("lines", keysOf(session)[0]);
  handle.edit("lot", "edited");
  const [record] = session.getSnapshot().values.lines;
  const snapshot = handle.getSnapshot();
  log.length = 0;
  // The price given would clear the lot through its event in an edit.
  const [added] = session.add("lines", [{ price: 5, lot: "given" }], { at: 0 });
  assert.deepEqual(log, [`amount ${added}`]);
  const { values } = session.getSnapshot();
  assert.deepEqual(values.lines[0], { quantity: 1, price: 5, amount: 5, lot: "given", size: null });
  assert.equal(values.lines[1], record);
  assert.equal(handle.getSnapshot(), snapshot);
  assert.deepEqual([values.total, values.first], [11, "given"]);
});

test("Each command publishes once", () => {
  const session = open([{}, {}]);
  const [a, b] = keysOf(session);
  let added;
  const counts = [
    publications(session, () => (added = session.add("lines", [{ price: 1 }, { price: 2 }]))),
    publications(session, () => session.move("lines", added[1], 0)),
    publications(session, () => session.patch({ rate: 2, lines: { [a]: { price: 3 } } })),
    publications(session, () => session.remove("lines", [a, b])),
  ];
  assert.deepEqual(counts, [1, 1, 1, 1]);
  assert.deepEqual(keysOf(session), [added[1], added[0]]);
});

test("remove removes multiple rows once even if their keys repeat and recalculates header readers", () => {
  const session = open(priced());
  const [a, b, c, d] = keysOf(session);
  const removed = session.row("lines", a);
  session.remove("lines", [a, c, a]);
  assert.deepEqual(keysOf(session), [b, d]);
  const { values } = session.getSnapshot();
  assert.deepEqual([values.total, values.count, values.first], [6, 2, "b"]);
  assert.equal(removed.getSnapshot(), undefined);
  const message = `Collection "lines": row "${a}" was removed`;
  assert.throws(() => removed.edit("price", 1), { message });
  rejects(session, () => session.row("lines", a), `Collection "lines": unknown row key "${a}"`);
});

test("move takes the row to its final position and runs structural readers without running its formulas or events", () => {
  const log = [];
  const session = open(priced(), log);
  const keys = keysOf(session);
  const [a, b, c, d] = keys;
  const records = session.getSnapshot().values.lines;
  const handles = keys.map((key) => session.row("lines", key));
  log.length = 0;
  session.move("lines", a, 1);
  assert.deepEqual(keysOf(session), [b, a, c, d]);
  session.move("lines", d, 1);
  assert.deepEqual(keysOf(session), [b, d, a, c]);
  session.move("lines", b, 3);
  assert.deepEqual(keysOf(session), [d, a, c, b]);
  assert.deepEqual(log, []);
  const { values } = session.getSnapshot();
  const moved = [records[3], records[0], records[2], records[1]];
  assert.deepEqual(same(values.lines, moved), [true, true, true, true]);
  assert.deepEqual([values.first, values.total], ["d", 10]);
  const found = keys.map((key) => session.row("lines", key));
  assert.deepEqual(same(found, handles), [true, true, true, true]);
});

test("patch writes the header and multiple rows in one operation, and its events and formulas can overwrite supplied values", () => {
  const log = [];
  const session = open([{ price: 1, lot: "a" }, { price: 2, lot: "b" }, { lot: "c" }], log);
  const [a, b, c] = keysOf(session);
  log.length = 0;
  session.patch({
    rate: 2,
    notes: "n",
    lines: { [a]: { price: 5, lot: "given" }, [b]: { quantity: 3, amount: 99 }, [c]: undefined },
  });
  const { values } = session.getSnapshot();
  // The event of price clears the lot given; the amount formula replaces the one given.
  const shown = values.lines.map(({ amount, lot }) => `${amount}/${lot}`);
  assert.deepEqual(shown, ["10/", "12/b", "0/c"]);
  assert.deepEqual([values.rate, values.notes, values.total], [2, "n", 22]);
  assert.deepEqual(
    log.filter((entry) => entry.startsWith("price")),
    [`price ${a}`],
  );
});

const noEffect = [
  ["An add with no rows", (session) => session.add("lines", [])],
  ["A remove with no keys", (session) => session.remove("lines", [])],
  ["An empty patch", (session) => session.patch({})],
  ["A move to the same position", (session) => session.move("lines", keysOf(session)[1], 1)],
];
for (const [name, command] of noEffect)
  test(`${name} has no effect, publishes, and preserves the identity of values, rows, and states`, () => {
    const log = [];
    const session = open(lettered("a", "b"), log);
    const before = session.getSnapshot();
    log.length = 0;
    const count = publications(session, () => command(session));
    const after = session.getSnapshot();
    assert.deepEqual([count, after === before, log], [1, false, []]);
    const kept = ["values", "rows", "fieldStates"].map((key) => after[key] === before[key]);
    kept.push(after.rows.lines === before.rows.lines);
    assert.deepEqual(kept, [true, true, true, true], "values, rows, fieldStates, rows.lines");
  });

const unknownKey = (key) => `Collection "lines": unknown row key "${key}"`;

test("Commands reject their arguments with the exact message and apply nothing", () => {
  const session = open(lettered("a", "b"));
  const [a] = keysOf(session);
  // A key of another session is unknown here.
  const foreign = keysOf(open([{}]))[0];
  const [line, add, move] = [
    'Unknown collection "line"',
    'Collection "lines" add',
    'Collection "lines" move',
  ];
  const incompatible = `${add}[1]: incompatible value "x" for number field "price"`;
  const keyed = 'Patch: collection "lines" in patch must be an object keyed by row';
  const stray = `Patch: unknown row key "${foreign}" in collection "lines"`;
  const unknownField = `Patch: row "${a}" of "lines": unknown field "foo" in patch`;
  const cases = [
    ["add", ["line", [{}]], line],
    ["remove", ["line", [a]], line],
    ["move", ["line", a, 0], line],
    ["row", ["line", a], line],
    ["add", ["lines", { lot: "x" }], `${add}: rows must be an array`],
    ["add", ["lines", [{}, "x"]], `${add}[1]: expected an object of field values`],
    ["add", ["lines", [{}, { foo: 1 }]], `${add}[1]: unknown field "foo"`],
    ["add", ["lines", [{}, { price: "x" }]], incompatible],
    ["add", ["lines", [{}], { at: 1.5 }], `${add}: position must be an integer, got 1.5`],
    ["add", ["lines", [{}], { at: 3 }], `${add}: position 3 is out of range 0..2`],
    ["add", ["lines", [{}], { at: -1 }], `${add}: position -1 is out of range 0..2`],
    ["remove", ["lines", a], 'Collection "lines" remove: keys must be an array'],
    ["remove", ["lines", [a, "unknown"]], unknownKey("unknown")],
    ["remove", ["lines", [foreign]], unknownKey(foreign)],
    ["move", ["lines", foreign, 0], unknownKey(foreign)],
    ["row", ["lines", foreign], unknownKey(foreign)],
    ["move", ["lines", a, 2], `${move}: position 2 is out of range 0..1`],
    ["move", ["lines", a, 0.5], `${move}: position must be an integer, got 0.5`],
    ["patch", [3], "Patch: expected a patch object, got 3"],
    ["patch", [null], "Patch: expected a patch object, got null"],
    ["patch", [{ notes: "n", lines: 3 }], keyed],
    ["patch", [{ notes: "n", lines: [] }], keyed],
    ["patch", [{ notes: "n", lines: { [foreign]: undefined } }], stray],
    ["patch", [{ notes: "n", lines: { [a]: { price: 1, foo: 1 } } }], unknownField],
    ["patch", [{ note: "n" }], 'Patch: unknown field "note" in patch'],
  ];
  for (const [method, args, message] of cases)
    rejects(session, () => session[method](...args), message);
});

test("Batch validation is complete, so an error in the last row leaves nothing behind and runs no rules", () => {
  const log = [];
  const session = open(lettered("a", "b"), log);
  const [a, b] = keysOf(session);
  log.length = 0;
  const rows = [{ price: 1 }, { price: 2 }, { price: "3" }];
  const invalid = 'Collection "lines" add[2]: incompatible value "3" for number field "price"';
  rejects(session, () => session.add("lines", rows), invalid);
  const patch = { rate: 3, lines: { [a]: { price: 1 }, [b]: { lot: 4 } } };
  const lot = `Patch: row "${b}" of "lines": incompatible value 4 for text field "lot"`;
  rejects(session, () => session.patch(patch), lot);
  rejects(session, () => session.remove("lines", [a, b, "zz"]), unknownKey("zz"));
  assert.deepEqual(log, []);
});

test("Keys from a failed add never appear and the next key is new", () => {
  const seen = [];
  const amount = ({ price }, { key }) => {
    seen.push(key);
    if (price === 13) throw new Error("Cursed price");
    return price;
  };
  const session = open([{ price: 1 }], [], { amount: { value: amount } });
  const used = new Set(keysOf(session));
  const before = session.getSnapshot();
  seen.length = 0;
  const failure = (error) =>
    error.message ===
    `Field "amount" of "lines" row "${seen.at(-1)}" value: formula failed: Cursed price`;
  assert.throws(() => session.add("lines", [{ price: 2 }, { price: 13 }]), failure);
  assert.equal(session.getSnapshot(), before);
  const failed = seen.filter((key) => !used.has(key));
  assert.ok(failed.length > 0);
  for (const key of failed) {
    rejects(session, () => session.row("lines", key), unknownKey(key));
    rejects(session, () => session.remove("lines", [key]), unknownKey(key));
  }
  const [next] = session.add("lines", [{ price: 3 }]);
  assert.ok(!used.has(next) && !failed.includes(next));
  assert.ok(keysOf(session).every((key) => !failed.includes(key)));
});

test("Every command throws during a notification and the session stays the same", () => {
  const session = open(lettered("a", "b"));
  const [a, b] = keysOf(session);
  const handle = session.row("lines", a);
  const attempts = [
    () => session.add("lines", [{}]),
    () => session.remove("lines", [a]),
    () => session.move("lines", a, 1),
    () => session.patch({ notes: "nested" }),
    () => handle.edit("price", 1),
  ];
  const caught = [];
  session.subscribe(() => {
    for (const attempt of attempts)
      try {
        attempt();
      } catch (error) {
        caught.push(error.message);
      }
  });
  session.edit("notes", "x");
  const operations = ["add rows to", "remove rows from", "move rows in", "patch", "edit"];
  const messages = operations.map((name) => `Cannot ${name} a session during its notification`);
  assert.deepEqual(caught, messages);
  assert.deepEqual(keysOf(session), [a, b]);
  const { values } = session.getSnapshot();
  assert.deepEqual([values.notes, handle.getSnapshot().values.price], ["x", null]);
});
