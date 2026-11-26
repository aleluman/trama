import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "trama-forms/core";
import { initial, order } from "../docs/site/examples/rows/order.ts";

// The order from the “Rows” page, used to exercise the demo steps without React.
const open = (sent = false) => createSession(order, { context: { sent }, initial });
const lines = (session) => session.getSnapshot().values.lines;
const pick = (session, field) => lines(session).map((line) => line[field]);

test("Changing the rate recalculates amounts and the total, and the branch stays disabled while there are lines", () => {
  const session = open();
  assert.deepEqual(pick(session, "amount"), [240, 400]);
  assert.equal(session.getSnapshot().values.total, 640);
  session.edit("rate", 2);
  assert.deepEqual(pick(session, "amount"), [480, 800]);
  assert.equal(session.getSnapshot().values.total, 1280);
  assert.deepEqual(session.getSnapshot().fieldStates.branch.reasons, ["There are lines"]);
  session.remove("lines", session.getSnapshot().rows.lines);
  assert.equal(session.getSnapshot().values.total, 0);
  assert.equal(session.getSnapshot().fieldStates.branch.disabled, false);
  session.add("lines", [{ product: "p3" }]);
  assert.equal(session.getSnapshot().fieldStates.branch.disabled, true);
});

test("The default warehouse is written to every line and clears each lot in a cascade", () => {
  const session = open();
  session.edit("depot", "north");
  assert.deepEqual(pick(session, "warehouse"), ["north", "north"]);
  assert.deepEqual(pick(session, "lot"), ["", ""]);
});

test("A sent order is read-only except for the header and line notes", () => {
  const session = open(true);
  const { fieldStates } = session.getSnapshot();
  for (const name of ["branch", "depot", "rate", "total"])
    assert.ok(fieldStates[name].reasons.includes("Sent"), name);
  assert.equal(fieldStates.notes.readOnly, false);
  for (const line of fieldStates.lines) {
    assert.deepEqual(line.quantity.reasons, ["Sent"]);
    assert.equal(line.notes.readOnly, false);
  }
});

test("The table adds at the start and end, duplicates without the ID, moves lines, and removes lines in one command", () => {
  const session = open();
  const [first, second] = session.getSnapshot().rows.lines;
  const [start] = session.add("lines", [{}], { at: 0 });
  session.add("lines", [{}]);
  assert.deepEqual(pick(session, "id"), ["", "L-1", "L-2", ""]);
  // The page duplicates without the id and the amount, which is calculated again.
  const { id: _id, amount: _amount, ...copy } = session.row("lines", first).getSnapshot().values;
  session.add("lines", [copy], { at: 2 });
  assert.deepEqual(pick(session, "id"), ["", "L-1", "", "L-2", ""]);
  assert.deepEqual(pick(session, "amount"), [0, 240, 240, 400, 0]);
  session.move("lines", second, 0);
  assert.equal(session.getSnapshot().rows.lines[0], second);
  const keys = session.getSnapshot().rows.lines;
  session.remove("lines", [start, keys.at(-1)]);
  assert.deepEqual(pick(session, "id"), ["L-2", "L-1", ""]);
  // The modal edits the same row through the same handle.
  session.row("lines", second).edit("quantity", 7);
  assert.equal(session.row("lines", second).getSnapshot().values.amount, 560);
});

test("A patch changes a line price and the note together, and reset restores the keys", () => {
  const session = open();
  const opened = session.getSnapshot().rows.lines;
  let publications = 0;
  session.subscribe(() => {
    publications += 1;
  });
  session.patch({ notes: "Price corrected", lines: { [opened[0]]: { price: 99 } } });
  assert.equal(publications, 1);
  assert.equal(session.getSnapshot().values.notes, "Price corrected");
  assert.equal(lines(session)[0].amount, 198);
  const handle = session.row("lines", opened[1]);
  session.add("lines", [{}]);
  session.remove("lines", [opened[1]]);
  session.reset();
  assert.deepEqual(session.getSnapshot().rows.lines, opened);
  assert.equal(session.row("lines", opened[1]), handle);
  assert.equal(session.getSnapshot().resetVersion, 1);
  assert.deepEqual(pick(session, "id"), ["L-1", "L-2"]);
});
