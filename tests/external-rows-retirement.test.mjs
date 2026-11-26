import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cell,
  errorCounts,
  externals,
  keys,
  lines,
  open,
  row,
  rowAt,
} from "./helpers/external-rows.mjs";

// When the external messages of rows leave: those of a cell with its value,
// and with them the own ones of its row; those of a collection when its rows
// change; and all those of a row when it is removed. Moving a row keeps them.
const everywhere = (session) => {
  session.setErrors("server", [
    cell(session, 0, "debit", "D0"),
    cell(session, 0, "memo", "M0"),
    row(session, 0, "R0"),
    cell(session, 1, "debit", "D1"),
    row(session, 1, "R1"),
    row(session, 2, "R2"),
    lines("L"),
    { field: "note", message: "N" },
    { message: "F" },
  ]);
  session.setWarnings("server", [row(session, 0, "W0"), cell(session, 0, "debit", "WD0")]);
};
const placed = {
  form: ["F"],
  lines: ["L"],
  "0.debit": ["D0"],
  "0.memo": ["M0"],
  0: ["R0"],
  "1.debit": ["D1"],
  1: ["R1"],
  2: ["R2"],
};
const without = (...names) =>
  Object.fromEntries(Object.entries(placed).filter(([name]) => !names.includes(name)));

test("Changing a cell withdraws only its external messages and its row's own messages", () => {
  const session = open();
  everywhere(session);
  assert.deepEqual(externals(session), placed);
  assert.deepEqual(errorCounts(session), [9, 7, [3, 2, 1]]);
  session.row("lines", keys(session)[0]).edit("memo", "x");
  assert.deepEqual(externals(session), without("0.memo", "0"));
  // The warnings of the row leave with its errors; those of the other cell stay.
  assert.deepEqual(rowAt(session, 0).warnings, []);
  assert.deepEqual(rowAt(session, 0).fieldStates.debit.warnings, ["WD0"]);
  assert.deepEqual(errorCounts(session), [7, 5, [1, 2, 1]]);
});

test("A cell change without a state change also withdraws its row's own messages", () => {
  const session = open();
  const handle = session.row("lines", keys(session)[2]);
  handle.edit("memo", "a");
  session.setErrors("server", [row(session, 2, "R2")]);
  const states = rowAt(session, 2).fieldStates;
  handle.edit("memo", "b");
  assert.equal(
    rowAt(session, 2).fieldStates,
    states,
    "Dirty before and after, with the same state",
  );
  assert.deepEqual(rowAt(session, 2).externalErrors, []);
  assert.deepEqual(errorCounts(session), [0, 0, [0, 0, 0]]);
});

test("A formula that changes a cell withdraws the cell's external messages and its row's own messages", () => {
  const session = open();
  everywhere(session);
  session.setErrors("audit", [cell(session, 1, "amount", "A1"), cell(session, 2, "amount", "A2")]);
  // The rate changes the amount of the rows with a debit: the first two.
  session.edit("rate", 3);
  const left = { ...without("0", "1"), "2.amount": ["A2"] };
  assert.deepEqual(externals(session), left);
  assert.deepEqual(session.getSnapshot().fieldStates.note.externalErrors, ["N"]);
  // An edit of the header that reaches no row withdraws only its own.
  session.edit("note", "n");
  assert.deepEqual(externals(session), left);
  assert.deepEqual(session.getSnapshot().fieldStates.note.externalErrors, []);
});

// Each change of the rows of a collection, and the collection it changes.
const structural = [
  ["lines", (session) => session.add("lines", [{ debit: 1 }])],
  ["lines", (session) => session.move("lines", keys(session)[2], 0)],
  ["lines", (session) => session.remove("lines", [keys(session)[2]])],
  ["taxes", (session) => session.remove("taxes", keys(session, "taxes"))],
];
test("Adding, removing, or moving rows withdraws only the collection's own external messages", () => {
  for (const [changed, change] of structural) {
    const session = open();
    everywhere(session);
    session.setErrors("audit", [{ collection: "taxes", message: "T" }]);
    const first = session.row("lines", keys(session)[0]);
    change(session);
    const { collections, externalErrors } = session.getSnapshot().form;
    assert.deepEqual(collections.lines.externalErrors, changed === "lines" ? [] : ["L"]);
    assert.deepEqual(collections.taxes.externalErrors, changed === "taxes" ? [] : ["T"]);
    assert.deepEqual(externalErrors, ["F"]);
    // The rows that stay keep theirs.
    assert.deepEqual(first.getSnapshot().externalErrors, ["R0"]);
    assert.deepEqual(first.getSnapshot().fieldStates.debit.externalErrors, ["D0"]);
  }
});

test("Moving a row preserves its external messages and those of its cells", () => {
  const session = open();
  everywhere(session);
  const [first] = keys(session);
  session.move("lines", first, 2);
  assert.deepEqual(keys(session).indexOf(first), 2);
  const moved = rowAt(session, 2);
  assert.deepEqual(moved.externalErrors, ["R0"]);
  assert.deepEqual(moved.fieldStates.debit.externalErrors, ["D0"]);
  assert.deepEqual(moved.fieldStates.memo.externalErrors, ["M0"]);
  assert.deepEqual(moved.warnings, ["W0"]);
  assert.deepEqual(rowAt(session, 0).externalErrors, ["R1"]);
  assert.deepEqual(errorCounts(session), [8, 6, [2, 1, 3]]);
});

test("Removing a row withdraws all its external messages, and a later replacement from its source does not look them up", () => {
  const session = open();
  everywhere(session);
  session.remove("lines", [keys(session)[0]]);
  assert.deepEqual(externals(session), { form: ["F"], "0.debit": ["D1"], 0: ["R1"], 1: ["R2"] });
  assert.deepEqual(errorCounts(session), [5, 3, [2, 1]]);
  session.setErrors("server", [row(session, 1, "R2b")]);
  assert.deepEqual(externals(session), { 1: ["R2b"] });
  assert.deepEqual(session.getSnapshot().fieldStates.note.externalErrors, []);
  session.setWarnings("server", []);
  assert.deepEqual(errorCounts(session), [1, 1, [0, 1]]);
});

test("reset withdraws external messages from rows, and restored rows return without them", () => {
  const session = open();
  const opened = [0, 1, 2].map((index) => rowAt(session, index));
  everywhere(session);
  session.remove("lines", [keys(session)[1]]);
  session.reset();
  assert.deepEqual(externals(session), {});
  assert.deepEqual(errorCounts(session), [0, 0, [0, 0, 0]]);
  for (const [index, snapshot] of opened.entries()) {
    const now = rowAt(session, index);
    assert.equal(now.fieldStates, snapshot.fieldStates);
    assert.deepEqual(now.warnings, []);
  }
});

test("commit withdraws external messages from cells that its canonical values change and preserves the rest", async () => {
  const session = open();
  const sent = await session.prepare();
  everywhere(session);
  const [first, second] = keys(session);
  assert.equal(
    session.commit(sent, { lines: { [first]: { memo: "canonical" }, [second]: {} } }),
    true,
  );
  assert.deepEqual(externals(session), without("0.memo", "0"));
  // A canonical value equal to the one in force changes nothing.
  assert.equal(
    session.commit(await session.prepare(), { lines: { [second]: { debit: 20 } } }),
    true,
  );
  assert.deepEqual(externals(session), without("0.memo", "0"));
});
