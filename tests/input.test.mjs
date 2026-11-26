import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { heard, rejects } from "./helpers/session.mjs";

// The pending input of a view: a text it could not convert into a value. Its
// controller reports a message, which is among the errors of its field, first,
// and makes the form inputPending without dirtying it. Each view has its own
// controller; reset disposes them all, and removing a row, those of its cells.
const trip = defineForm({
  fields: {
    since: field.date({ required: true }),
    note: field.text(),
  },
  collections: { legs: { fields: { day: field.date(), stop: field.text() } } },
});
const initial = { since: "2026-01-02", legs: [{ day: "2026-01-03" }, {}] };
const keys = (session) => session.getSnapshot().rows.legs;
const since = (session) => session.getSnapshot().fieldStates.since;
const counting = (session) => {
  const { form } = session.getSnapshot();
  return { errorCount: form.errorCount, inputPending: form.inputPending, dirty: form.dirty };
};

test("the form publishes inputPending as false, and creating a controller does not publish", () => {
  const session = createSession(trip, { initial });
  const before = session.getSnapshot();
  assert.equal(before.form.inputPending, false);
  const snapshots = heard(session);
  const view = session.input("since");
  session.row("legs", keys(session)[0]).input("day");
  assert.deepEqual(Object.keys(view).toSorted(), ["dispose", "error"]);
  assert.ok(Object.isFrozen(view));
  assert.equal(snapshots.length, 0);
  assert.equal(session.getSnapshot(), before);
});

test("a message is the field's first error without changing its value or making it dirty, and withdrawing the message removes it", () => {
  const session = createSession(trip, { initial });
  const values = session.getSnapshot().values;
  const view = session.input("since");
  const snapshots = heard(session);
  view.error("Incomplete date");
  assert.equal(snapshots.length, 1);
  assert.equal(session.getSnapshot().values, values);
  assert.deepEqual(since(session).errors, ["Incomplete date"]);
  assert.equal(since(session).dirty, false);
  assert.deepEqual(counting(session), { errorCount: 1, inputPending: true, dirty: false });
  // The same message publishes nothing.
  view.error("Incomplete date");
  assert.equal(snapshots.length, 1);
  // Before the error of validation.
  session.edit("since", null);
  assert.deepEqual(since(session).errors, ["Incomplete date", "Required"]);
  view.error();
  assert.deepEqual(since(session).errors, ["Required"]);
  assert.deepEqual(counting(session), { errorCount: 1, inputPending: false, dirty: true });
  view.error();
  assert.equal(snapshots.length, 3);
});

test("two views of the same field report separately, in the order they were created", () => {
  const session = createSession(trip, { initial });
  const table = session.input("since");
  const modal = session.input("since");
  modal.error("Incomplete month");
  table.error("Incomplete year");
  assert.deepEqual(since(session).errors, ["Incomplete year", "Incomplete month"]);
  // Correcting one keeps the problem of the other.
  table.error();
  assert.deepEqual(since(session).errors, ["Incomplete month"]);
  assert.equal(session.getSnapshot().form.inputPending, true);
  modal.dispose();
  assert.deepEqual(since(session).errors, []);
  assert.equal(session.getSnapshot().form.inputPending, false);
});

test("dispose withdraws its view's contribution and is idempotent, and error throws afterward", () => {
  const session = createSession(trip, { initial });
  const view = session.input("since");
  view.error("Incomplete date");
  const snapshots = heard(session);
  view.dispose();
  assert.equal(snapshots.length, 1);
  assert.deepEqual(since(session).errors, []);
  view.dispose();
  assert.equal(snapshots.length, 1);
  rejects(session, () => view.error("Another"), 'input of "since": the view was disposed');
  rejects(session, () => view.error(), 'input of "since": the view was disposed');
  // A view without a message disposes without publishing.
  session.input("note").dispose();
  assert.equal(snapshots.length, 1);
});

test("pending input makes prepare return invalid with the problem on its field", async () => {
  const session = createSession(trip, { initial });
  const [first] = keys(session);
  session.input("since").error("Incomplete date");
  session.row("legs", first).input("day").error("Incomplete day");
  const result = await session.prepare();
  assert.deepEqual(result, {
    status: "invalid",
    issues: [
      { message: "Incomplete date", field: "since" },
      { message: "Incomplete day", collection: "legs", key: first, field: "day" },
    ],
  });
});

test("a cell reports within its row, which counts the error while other rows retain their snapshots", () => {
  const session = createSession(trip, { initial });
  const [first, second] = keys(session);
  const other = session.row("legs", second).getSnapshot();
  const view = session.row("legs", first).input("day");
  view.error("Incomplete day");
  const row = session.row("legs", first).getSnapshot();
  assert.deepEqual(row.fieldStates.day.errors, ["Incomplete day"]);
  assert.deepEqual([row.errorCount, row.dirty], [1, false]);
  assert.deepEqual(session.getSnapshot().form.collections.legs.errorCount, 1);
  assert.equal(session.getSnapshot().form.inputPending, true);
  assert.equal(session.row("legs", second).getSnapshot(), other);
});

test("withdrawing pending input restores the cell to its previous state, which it shares again with an equal cell", () => {
  const session = createSession(trip, { initial: { since: "2026-01-02", legs: [{}, {}] } });
  const [first, second] = keys(session);
  const stop = (key) => session.row("legs", key).getSnapshot().fieldStates.stop;
  assert.equal(stop(first), stop(second));
  const view = session.row("legs", first).input("stop");
  view.error("Incomplete stop");
  assert.notEqual(stop(first), stop(second));
  view.error();
  assert.equal(stop(first), stop(second));
});

test("reset invalidates all controllers and clears pending input", () => {
  const session = createSession(trip, { initial });
  const [first] = keys(session);
  const view = session.input("since");
  const cell = session.row("legs", first).input("day");
  view.error("Incomplete date");
  cell.error("Incomplete day");
  session.reset();
  assert.deepEqual(counting(session), { errorCount: 0, inputPending: false, dirty: false });
  assert.deepEqual(since(session).errors, []);
  assert.deepEqual(session.row("legs", first).getSnapshot().fieldStates.day.errors, []);
  assert.throws(() => view.error("Another"), {
    message: 'input of "since": the view was disposed',
  });
  assert.throws(() => cell.error(), {
    message: 'Collection "legs": input of "day": the view was disposed',
  });
  view.dispose();
  // A new view reports again.
  session.input("since").error("Another");
  assert.deepEqual(since(session).errors, ["Another"]);
});

test("removing a row withdraws only the pending input of its own cells", () => {
  const session = createSession(trip, { initial });
  const [first, second] = keys(session);
  const gone = session.row("legs", first).input("day");
  const kept = session.row("legs", second).input("day");
  gone.error("Incomplete day");
  kept.error("Another day");
  session.remove("legs", [first]);
  assert.deepEqual(counting(session), { errorCount: 1, inputPending: true, dirty: true });
  assert.throws(() => gone.error(), {
    message: 'Collection "legs": input of "day": the view was disposed',
  });
  gone.dispose();
  kept.dispose();
  assert.equal(session.getSnapshot().form.inputPending, false);
});

test("commit retains pending input and its controllers", async () => {
  const session = createSession(trip, { initial });
  const sent = await session.prepare();
  const view = session.input("note");
  view.error("Pending text");
  assert.equal(session.commit(sent, { note: "server" }), true);
  assert.deepEqual(session.getSnapshot().fieldStates.note.errors, ["Pending text"]);
  assert.equal(session.getSnapshot().form.inputPending, true);
  view.error();
  assert.equal(session.getSnapshot().form.inputPending, false);
});

test("input checks the field and row, and error checks the message and guard, without publishing", () => {
  const session = createSession(trip, { initial });
  const [first] = keys(session);
  rejects(session, () => session.input("absent"), 'input: field "absent" does not exist');
  rejects(session, () => session.input("legs"), 'input: field "legs" does not exist');
  rejects(
    session,
    () => session.row("legs", first).input("absent"),
    'Collection "legs": input: field "absent" does not exist',
  );
  const view = session.input("since");
  for (const message of ["", 3, null])
    rejects(
      session,
      () => view.error(message),
      'input of "since": message must be a non-empty string or undefined',
    );
  const cell = session.row("legs", first).input("day");
  rejects(
    session,
    () => cell.error(""),
    'Collection "legs": input of "day": message must be a non-empty string or undefined',
  );
  const handle = session.row("legs", first);
  session.remove("legs", [first]);
  rejects(session, () => handle.input("day"), `Collection "legs": row "${first}" was removed`);
  const stop = session.subscribe(() => {
    assert.throws(() => view.error("Another"), {
      message: "Cannot report input to a session during its notification",
    });
    assert.throws(() => view.dispose(), {
      message: "Cannot report input to a session during its notification",
    });
  });
  session.edit("note", "x");
  stop();
});
