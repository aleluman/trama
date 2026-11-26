import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects } from "./helpers/session.mjs";

// An order whose lines lock their lot while the header is locked, and taxes.
const order = defineForm({
  fields: { locked: field.checkbox(), notes: field.text() },
  collections: {
    lines: {
      fields: {
        quantity: field.number({ default: 1 }),
        price: field.number(),
        size: field.select({ options: [{ value: "s", label: "S" }] }),
        lot: field.text(),
      },
    },
    taxes: { fields: { rate: field.number() } },
  },
  rules: {
    lines: { each: { lot: { disabled: (_, { values }) => values.locked && "Locked" } } },
  },
});
const open = (lines = [{}, {}]) => createSession(order, { initial: { lines, taxes: [{}] } });
// The price of the row of a handle, or that it has no row.
const priceOf = (handle) => {
  const snapshot = handle.getSnapshot();
  return snapshot === undefined ? "no row" : snapshot.values.price;
};
// What a handle listener and then a session listener hear of one publication.
const both = (price) => [["handle", price], ["session"]];
const removed = (key) => `Collection "lines": row "${key}" was removed`;
const unknownKey = (key, collection = "lines") =>
  `Collection "${collection}": unknown row key ${typeof key === "string" ? `"${key}"` : String(key)}`;

test("session.row returns the same handle with its collection, key, and fields while the row exists", () => {
  const session = open();
  const [first, second] = keysOf(session);
  const handle = session.row("lines", first);
  assert.equal(session.row("lines", first), handle);
  assert.notEqual(session.row("lines", second), handle);
  assert.deepEqual(Object.keys(handle).toSorted(), [
    "collection",
    "edit",
    "fields",
    "getSnapshot",
    "input",
    "key",
    "list",
    "retry",
    "subscribe",
    "touch",
  ]);
  assert.equal(handle.collection, "lines");
  assert.equal(handle.key, first);
  assert.deepEqual(handle.fields, order.collections.lines.fields);
  // Edits, moves and other commands keep it.
  handle.edit("price", 2);
  session.add("lines", [{}], { at: 0 });
  session.move("lines", first, 2);
  session.remove("lines", [second]);
  session.edit("notes", "x");
  assert.equal(session.row("lines", first), handle);
  // Another session of the same form has its own handles.
  const other = open();
  assert.notEqual(other.row("lines", keysOf(other)[0]), handle);
});

test("The handle's getSnapshot publishes its row record and states in an object that keeps its identity while they stay the same", () => {
  const session = open();
  const [first, second] = keysOf(session);
  const handle = session.row("lines", first);
  const opened = handle.getSnapshot();
  assert.deepEqual(Object.keys(opened).toSorted(), [
    "attempted",
    "dirty",
    "errorCount",
    "errors",
    "externalErrors",
    "fieldStates",
    "queries",
    "resetVersion",
    "touched",
    "values",
    "warningCount",
    "warnings",
  ]);
  assert.ok(Object.isFrozen(opened));
  // A collection without queries has the same empty states in every row.
  assert.deepEqual(opened.queries, {});
  assert.equal(session.row("lines", second).getSnapshot().queries, opened.queries);
  const published = session.getSnapshot();
  assert.equal(opened.values, published.values.lines[0]);
  assert.equal(opened.fieldStates, published.fieldStates.lines[0]);
  assert.equal(opened.resetVersion, 0);
  assert.equal(handle.getSnapshot(), opened);
  // Nothing of its row changes: a header field it does not read, another row,
  // an edit without difference, rows added before it and a move.
  session.edit("notes", "x");
  session.row("lines", second).edit("price", 3);
  handle.edit("quantity", 1);
  session.add("lines", [{}], { at: 0 });
  session.move("lines", first, 2);
  assert.equal(handle.getSnapshot(), opened);
});

test("The handle's getSnapshot changes when its row's values, states, or resetVersion change", () => {
  const session = open();
  const handle = session.row("lines", keysOf(session)[0]);
  const opened = handle.getSnapshot();
  handle.edit("quantity", 3);
  const edited = handle.getSnapshot();
  assert.notEqual(edited, opened);
  assert.equal(edited.values.quantity, 3);
  assert.equal(edited.fieldStates.quantity.dirty, true);
  assert.equal(edited.fieldStates.lot, opened.fieldStates.lot);
  assert.equal(handle.getSnapshot(), edited);
  // The lock of the header changes only the states of the row.
  session.edit("locked", true);
  const locked = handle.getSnapshot();
  assert.notEqual(locked, edited);
  assert.equal(locked.values, edited.values);
  assert.equal(locked.fieldStates.lot.disabled, true);
  // A reset that changes nothing of the row changes only its resetVersion.
  session.reset();
  const reset = handle.getSnapshot();
  session.reset();
  const again = handle.getSnapshot();
  assert.notEqual(again, reset);
  assert.deepEqual(again.values, reset.values);
  assert.deepEqual(again.fieldStates, reset.fieldStates);
  assert.deepEqual([reset.resetVersion, again.resetVersion], [1, 2]);
  assert.equal(handle.getSnapshot(), again);
});

test("After remove, getSnapshot returns undefined, edit throws, and session.row rejects the key as unknown", () => {
  const session = open();
  const [first, second] = keysOf(session);
  const handle = session.row("lines", first);
  session.remove("lines", [first]);
  assert.equal(handle.getSnapshot(), undefined);
  assert.deepEqual([handle.collection, handle.key], ["lines", first]);
  rejects(session, () => handle.edit("price", 1), removed(first));
  rejects(session, () => session.row("lines", first), unknownKey(first));
  // The other row and its handle are untouched.
  session.row("lines", second).edit("price", 4);
  assert.deepEqual(keysOf(session), [second]);
  assert.equal(handle.getSnapshot(), undefined);
});

test("Reset restores a removed baseline row's handle with the same identity", () => {
  const session = open([{ price: 2 }, {}]);
  const [first] = keysOf(session);
  const handle = session.row("lines", first);
  handle.edit("price", 5);
  session.remove("lines", [first]);
  session.reset();
  assert.equal(session.row("lines", first), handle);
  const { values, resetVersion } = handle.getSnapshot();
  assert.deepEqual(values, { quantity: 1, price: 2, size: null, lot: "" });
  assert.equal(resetVersion, 1);
  handle.edit("price", 7);
  assert.equal(session.getSnapshot().values.lines[0].price, 7);
  assert.equal(handle.getSnapshot().values.price, 7);
});

test("Reset leaves an added row absent and its handle without a row", () => {
  const session = open();
  const [added, removedFirst] = session.add("lines", [{ price: 4 }, {}]);
  const handle = session.row("lines", added);
  const other = session.row("lines", removedFirst);
  session.remove("lines", [removedFirst]);
  session.reset();
  assert.equal(keysOf(session).length, 2);
  for (const [key, row] of [
    [added, handle],
    [removedFirst, other],
  ]) {
    assert.ok(!keysOf(session).includes(key));
    assert.equal(row.getSnapshot(), undefined);
    rejects(session, () => session.row("lines", key), unknownKey(key));
    rejects(session, () => row.edit("price", 1), removed(key));
  }
});

test("The handle's subscribe notifies on every session publication and can unsubscribe even when the row is absent", () => {
  const session = open();
  const [first, second] = keysOf(session);
  const handle = session.row("lines", first);
  const heard = [];
  const stop = handle.subscribe(() => heard.push(["handle", priceOf(handle)]));
  const stopSession = session.subscribe(() => heard.push(["session"]));
  session.edit("notes", "x");
  session.row("lines", second).edit("price", 2);
  handle.edit("price", 3);
  session.remove("lines", [first]);
  // A listener added while the row does not exist hears too, until it leaves.
  const late = handle.subscribe(() => heard.push(["late"]));
  session.edit("notes", "y");
  late();
  stop();
  session.edit("notes", "z");
  session.reset();
  stopSession();
  session.edit("notes", "w");
  assert.deepEqual(heard, [
    ...both(null),
    ...both(null),
    ...both(3),
    ...both("no row"),
    ["handle", "no row"],
    ["session"],
    ["late"],
    ["session"],
    ["session"],
  ]);
});

test("The handle's edit rejects an unknown field in its row or an invalid value without publishing", () => {
  const session = open();
  const [first] = keysOf(session);
  const handle = session.row("lines", first);
  // notes is a field of the header and rate one of taxes.
  for (const name of ["pricee", "notes", "rate", "toString", "__proto__"])
    rejects(session, () => handle.edit(name, 1), `Collection "lines": unknown field "${name}"`);
  const row = `of "lines" row "${first}"`;
  for (const [name, value, message] of [
    ["price", "x", `Field "price" ${row} (number): incompatible value x`],
    ["price", Number.NaN, `Field "price" ${row} (number): incompatible value NaN`],
    ["price", undefined, `Field "price" ${row} (number): incompatible value undefined`],
    ["size", "m", `Field "size" ${row} (select): incompatible value m`],
    ["lot", 5, `Field "lot" ${row} (text): incompatible value 5`],
  ])
    rejects(session, () => handle.edit(name, value), message);
  handle.edit("price", 1);
  assert.equal(handle.getSnapshot().values.price, 1);
});

test("The handle's edit throws during a notification and the session remains editable afterward", () => {
  const session = open();
  const handle = session.row("lines", keysOf(session)[0]);
  const caught = [];
  const attempt = () => {
    try {
      handle.edit("price", 9);
    } catch (error) {
      caught.push(error.message);
    }
  };
  const stopSession = session.subscribe(attempt);
  // A listener is a function in a set: the handle needs another one.
  const stopHandle = handle.subscribe(() => attempt());
  session.edit("notes", "x");
  stopSession();
  stopHandle();
  const message = "Cannot edit a session during its notification";
  assert.deepEqual(caught, [message, message]);
  assert.equal(handle.getSnapshot().values.price, null);
  handle.edit("price", 9);
  assert.equal(handle.getSnapshot().values.price, 9);
});

test("A key from another session or collection is unknown", () => {
  const session = open();
  const other = open();
  const [line] = keysOf(session);
  const [tax] = keysOf(session, "taxes");
  const [foreign] = keysOf(other);
  rejects(session, () => session.row("lines", foreign), unknownKey(foreign));
  rejects(session, () => session.row("lines", tax), unknownKey(tax));
  rejects(session, () => session.row("taxes", line), unknownKey(line, "taxes"));
  for (const key of [0, undefined])
    rejects(session, () => session.row("lines", key), unknownKey(key));
  rejects(session, () => session.row("line", line), 'Unknown collection "line"');
  // The commands that take keys reject them as well.
  rejects(session, () => session.remove("lines", [foreign]), unknownKey(foreign));
  rejects(session, () => session.move("lines", foreign, 0), unknownKey(foreign));
  rejects(
    session,
    () => session.patch({ lines: { [foreign]: { price: 1 } } }),
    `Patch: unknown row key "${foreign}" in collection "lines"`,
  );
  // The handle of the other session edits only its own row.
  const before = session.getSnapshot();
  other.row("lines", foreign).edit("price", 2);
  assert.equal(session.getSnapshot(), before);
  assert.equal(other.getSnapshot().values.lines[0].price, 2);
});
