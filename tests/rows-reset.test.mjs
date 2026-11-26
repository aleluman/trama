import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects } from "./helpers/session.mjs";

const order = defineForm({
  fields: { notes: field.text(), total: field.number(), count: field.number() },
  collections: {
    lines: { fields: { lot: field.text(), price: field.number(), amount: field.number() } },
  },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    count: { value: ({ lines }) => lines.length },
    lines: { each: { amount: { value: ({ price }) => (price ?? 0) * 2 } } },
  },
});
const open = () =>
  createSession(order, {
    initial: {
      lines: [
        { lot: "a", price: 1 },
        { lot: "b", price: 2 },
        { lot: "c", price: 3 },
      ],
    },
  });
const handlesOf = (session) => keysOf(session).map((key) => session.row("lines", key));
const same = (actual, expected) => actual.map((item, index) => item === expected[index]);
const unknownKey = (key) => `Collection "lines": unknown row key "${key}"`;

test("After adding, removing, and moving baseline rows, reset restores their keys, order, and values", () => {
  const session = open();
  const opened = session.getSnapshot();
  const [a, b, c] = keysOf(session);
  const added = session.add("lines", [{ lot: "x" }, { lot: "y", price: 4 }], { at: 1 });
  session.remove("lines", [b, added[0]]);
  session.move("lines", c, 0);
  session.row("lines", a).edit("price", 9);
  session.patch({ notes: "n", lines: { [c]: { lot: "z" }, [added[1]]: { price: 5 } } });
  assert.deepEqual(keysOf(session), [c, a, added[1]]);
  assert.equal(session.getSnapshot().resetVersion, 0, "Commands do not change resetVersion");
  session.reset();
  const after = session.getSnapshot();
  assert.deepEqual(after.rows.lines, [a, b, c]);
  assert.deepEqual(after.values, opened.values);
  assert.deepEqual(after.fieldStates, opened.fieldStates);
  assert.equal(after.resetVersion, opened.resetVersion + 1);
  session.reset();
  assert.equal(session.getSnapshot().resetVersion, opened.resetVersion + 2);
});

test("Baseline handles keep their identity and work again after reset", () => {
  const session = open();
  const handles = handlesOf(session);
  const [a, b] = keysOf(session);
  session.remove("lines", [b]);
  session.move("lines", a, 1);
  session.row("lines", a).edit("lot", "edited");
  assert.equal(handles[1].getSnapshot(), undefined);
  session.reset();
  assert.deepEqual(same(handlesOf(session), handles), [true, true, true]);
  const snapshots = handles.map((handle) => handle.getSnapshot());
  assert.deepEqual(
    snapshots.map(({ values, resetVersion }) => [values.lot, resetVersion]),
    [
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ],
  );
  handles[1].edit("price", 7);
  const { values } = session.getSnapshot();
  assert.deepEqual(
    [values.lines[1].amount, values.total, handles[1].getSnapshot().values.price],
    [14, 22, 7],
  );
  assert.deepEqual(
    same(
      handles.map((handle) => handle.getSnapshot()),
      snapshots,
    ),
    [true, false, true],
  );
});

test("Reset removes added rows and their keys are rejected", () => {
  const session = open();
  const added = session.add("lines", [{ lot: "x" }, { lot: "y" }], { at: 0 });
  const handles = added.map((key) => session.row("lines", key));
  session.reset();
  assert.ok(keysOf(session).every((key) => !added.includes(key)));
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ lot }) => lot),
    ["a", "b", "c"],
  );
  for (const [index, key] of added.entries()) {
    assert.equal(handles[index].getSnapshot(), undefined);
    const removed = `Collection "lines": row "${key}" was removed`;
    assert.throws(() => handles[index].edit("lot", "z"), { message: removed });
    rejects(session, () => session.row("lines", key), unknownKey(key));
    rejects(session, () => session.remove("lines", [key]), unknownKey(key));
    rejects(session, () => session.move("lines", key, 0), unknownKey(key));
    const stray = `Patch: unknown row key "${key}" in collection "lines"`;
    rejects(session, () => session.patch({ lines: { [key]: { lot: "z" } } }), stray);
  }
});

test("After reset, a row formula follows its opening branch again", () => {
  let runs = 0;
  // A fixed amount reads manual; any other reads quantity and price.
  const amount = (row) => {
    runs++;
    return row.fixed ? row.manual : (row.quantity ?? 0) * (row.price ?? 0);
  };
  const definition = defineForm({
    fields: {},
    collections: {
      lines: {
        fields: {
          fixed: field.checkbox({ default: true }),
          manual: field.number(),
          quantity: field.number({ default: 1 }),
          price: field.number(),
          amount: field.number(),
        },
      },
    },
    rules: { lines: { each: { amount: { value: amount } } } },
  });
  const session = createSession(definition, { initial: { lines: [{ manual: 5 }, { manual: 6 }] } });
  const [edited, removed] = handlesOf(session);
  edited.edit("fixed", false);
  edited.edit("price", 4);
  session.remove("lines", [removed.key]);
  session.reset();
  const amounts = () => session.getSnapshot().values.lines.map((line) => line.amount);
  assert.deepEqual(amounts(), [5, 6]);
  runs = 0;
  // Only the opening reads count: quantity and price no longer run the formula.
  edited.edit("quantity", 3);
  edited.edit("price", 2);
  removed.edit("price", 2);
  assert.deepEqual([runs, amounts()], [0, [5, 6]]);
  edited.edit("manual", 8);
  removed.edit("manual", 9);
  assert.deepEqual([runs, amounts()], [2, [8, 9]]);
});

test("New keys after reset never reuse previous keys", () => {
  const session = open();
  const used = new Set(keysOf(session));
  const fresh = (keys) => {
    assert.ok(keys.every((key) => !used.has(key)));
    for (const key of keys) used.add(key);
  };
  fresh(session.add("lines", [{}, {}]));
  session.reset();
  fresh(session.add("lines", [{}, {}]));
  session.remove("lines", [keysOf(session)[0]]);
  session.reset();
  fresh(session.add("lines", [{}, {}, {}], { at: 0 }));
  session.reset();
  fresh(keysOf(open()));
  assert.equal(used.size, 3 + 2 + 2 + 3 + 3);
});
