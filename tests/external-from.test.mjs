import assert from "node:assert/strict";
import { test } from "node:test";
import { counts, external, heard, open, stateOf } from "./helpers/external.mjs";
import { open as openRows } from "./helpers/external-rows.mjs";
import { rejects } from "./helpers/session.mjs";

// from: the prepared that was sent. The destinations that changed after
// preparing are left out, even back at their value, and a prepared that is
// too old replaces nothing and gives false.
const rejection = [
  { field: "until", message: "End date rejected" },
  { field: "note", message: "Note rejected" },
  { field: "total", message: "Total rejected" },
  { message: "General" },
];
const placed = (session) =>
  Object.fromEntries(
    ["since", "until", "note", "quantity", "total"]
      .map((name) => [name, external(session, name)])
      .filter(([, errors]) => errors.length > 0),
  );

test("from omits destinations that changed after preparing even if they returned to their previous values", async () => {
  const session = open();
  session.edit("note", "before");
  const sent = await session.prepare();
  session.edit("until", "2026-03-01");
  session.edit("until", "2026-02-01");
  const snapshots = heard(session);
  assert.equal(session.setErrors("server", rejection, { from: sent }), true);
  assert.equal(snapshots.length, 1);
  // note changed before preparing, and until after it.
  assert.deepEqual(placed(session), { note: ["Note rejected"], total: ["Total rejected"] });
  assert.deepEqual(session.getSnapshot().form.externalErrors, ["General"]);
  assert.deepEqual(counts(session), [3, 0]);
});

test("A no-op edit after preparing leaves the destination in place, and a formula change omits it", async () => {
  const session = open();
  const sent = await session.prepare();
  session.edit("until", "2026-02-01");
  session.edit("quantity", 4);
  session.setErrors("server", rejection, { from: sent });
  assert.deepEqual(placed(session), { until: ["End date rejected"], note: ["Note rejected"] });
});

test("The form's own destination is never omitted. A replacement with no remaining destinations is accepted and clears the source", async () => {
  const session = open();
  session.setErrors("server", [{ field: "since", message: "Previous" }]);
  const sent = await session.prepare();
  session.patch({ until: "2026-03-01", note: "n", quantity: 4 });
  assert.equal(session.setErrors("server", rejection, { from: sent }), true);
  assert.deepEqual(placed(session), {});
  assert.deepEqual(session.getSnapshot().form.externalErrors, ["General"]);
  assert.equal(session.setErrors("server", rejection.slice(0, 3), { from: sent }), true);
  assert.deepEqual(counts(session), [0, 0]);
});

test("A prepared submission from before a reset replaces nothing and returns false", async () => {
  const session = open();
  const sent = await session.prepare();
  session.reset();
  // Another prepare after the reset starts the revisions again.
  await session.prepare();
  session.setErrors("server", [{ field: "since", message: "Current" }]);
  const before = session.getSnapshot();
  const snapshots = heard(session);
  assert.equal(session.setErrors("server", rejection, { from: sent }), false);
  assert.equal(session.setWarnings("server", rejection, { from: sent }), false);
  assert.equal(snapshots.length, 0);
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(placed(session), { since: ["Current"] });
});

test("A prepared submission from before the commit of a later one returns false, and the one that was committed remains valid", async () => {
  const session = open();
  const first = await session.prepare();
  const second = await session.prepare();
  assert.equal(session.commit(second), true);
  assert.equal(session.setErrors("server", rejection, { from: first }), false);
  assert.deepEqual(placed(session), {});
  assert.equal(session.setWarnings("server", rejection, { from: second }), true);
  assert.deepEqual(stateOf(session, "until").warnings, ["End date rejected"]);
});

test("Writes from another prepared submission's commit count as changes for from, and writes from its own commit do not", async () => {
  const session = open();
  const first = await session.prepare();
  const second = await session.prepare();
  // The server of the first writes the note and the quantity, and the total follows.
  assert.equal(session.commit(first, { note: "saved", quantity: 4 }), true);
  assert.equal(session.setErrors("server", rejection, { from: second }), true);
  assert.deepEqual(placed(session), { until: ["End date rejected"] });
  // For the first, what its own commit wrote is of its server.
  assert.equal(session.setErrors("audit", rejection, { from: first }), true);
  assert.deepEqual(placed(session), {
    until: ["End date rejected"],
    note: ["Note rejected"],
    total: ["Total rejected"],
  });
});

test("Another prepared submission's commit counts for from in cells and in the row's own destination as well", async () => {
  const session = openRows();
  const [line] = session.getSnapshot().rows.lines;
  const first = await session.prepare();
  const second = await session.prepare();
  assert.equal(session.commit(first, { lines: { [line]: { debit: 99 } } }), true);
  const issues = [
    { collection: "lines", key: line, field: "debit", message: "Debit rejected" },
    { collection: "lines", key: line, message: "Line rejected" },
    { collection: "lines", key: line, field: "memo", message: "Memo rejected" },
  ];
  assert.equal(session.setErrors("server", issues, { from: second }), true);
  const row = session.row("lines", line).getSnapshot();
  assert.deepEqual(row.fieldStates.debit.externalErrors, []);
  assert.deepEqual(row.externalErrors, []);
  assert.deepEqual(row.fieldStates.memo.externalErrors, ["Memo rejected"]);
});

test("A response older than the prepared submission that last wrote to the source returns false in both channels", async () => {
  const session = open();
  const first = await session.prepare();
  const second = await session.prepare();
  assert.equal(session.setErrors("server", [rejection[0]], { from: second }), true);
  assert.equal(session.setErrors("server", [rejection[1]], { from: first }), false);
  assert.equal(session.setWarnings("server", [rejection[1]], { from: first }), false);
  assert.deepEqual(placed(session), { until: ["End date rejected"] });
  assert.deepEqual(stateOf(session, "note").warnings, []);
  // The same prepared writes again, also its other channel; another source is apart.
  assert.equal(session.setWarnings("server", [rejection[1]], { from: second }), true);
  assert.equal(session.setErrors("server", [rejection[1]], { from: second }), true);
  assert.equal(session.setErrors("audit", [rejection[2]], { from: first }), true);
  assert.deepEqual(placed(session), { note: ["Note rejected"], total: ["Total rejected"] });
});

test("A call without from always replaces the messages and leaves its source's sequence unchanged", async () => {
  const session = open();
  const first = await session.prepare();
  const second = await session.prepare();
  session.reset();
  assert.equal(session.setErrors("server", [rejection[0]]), true);
  const third = await session.prepare();
  const fourth = await session.prepare();
  assert.equal(session.setErrors("server", [rejection[1]], { from: fourth }), true);
  assert.equal(session.setErrors("server", [rejection[2]]), true);
  assert.equal(session.setErrors("server", [rejection[0]], { from: third }), false);
  assert.deepEqual(placed(session), { total: ["Total rejected"] });
  // A source that a reset emptied starts again.
  session.reset();
  assert.equal(session.setErrors("server", [rejection[0]], { from: first }), false);
  assert.equal(session.setErrors("server", [rejection[0]], { from: second }), false);
  const fifth = await session.prepare();
  assert.equal(session.setErrors("server", [rejection[0]], { from: fifth }), true);
});

test("With two active prepared submissions, each omits what changed after it", async () => {
  const session = open();
  const first = await session.prepare();
  session.edit("until", "2026-03-01");
  const second = await session.prepare();
  session.edit("note", "n");
  session.setErrors("first", rejection, { from: first });
  session.setErrors("second", rejection, { from: second });
  assert.deepEqual(placed(session), {
    until: ["End date rejected"],
    total: ["Total rejected"],
  });
  session.setErrors("second", []);
  assert.deepEqual(placed(session), { total: ["Total rejected"] });
});

test("Recalculating a total to the same value preserves the revision of its last actual change", async () => {
  const session = open();
  const older = await session.prepare();
  session.edit("total", 6);
  const newer = await session.prepare();
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 6);

  session.setErrors("older", [rejection[2]], { from: older });
  assert.deepEqual(external(session, "total"), []);
  session.setErrors("newer", [rejection[2]], { from: newer });
  assert.deepEqual(external(session, "total"), ["Total rejected"]);

  assert.equal(session.commit(older, { total: 77 }), true);
  assert.equal(session.getSnapshot().values.total, 6);
  assert.equal(stateOf(session, "total").dirty, true);
  assert.equal(session.commit(newer, { total: 88 }), true);
  assert.equal(session.getSnapshot().values.total, 88);
  assert.equal(stateOf(session, "total").dirty, false);
});

test("After its commit, from is valid until the next value change", async () => {
  const session = open();
  const sent = await session.prepare();
  session.edit("note", "while saving");
  assert.equal(session.commit(sent, { total: 99, quantity: 1 }), true);
  // What the commit wrote is of the server: its destination is not left out.
  assert.equal(session.getSnapshot().values.total, 99);
  assert.equal(session.setWarnings("server", rejection, { from: sent }), true);
  assert.deepEqual(stateOf(session, "total").warnings, ["Total rejected"]);
  assert.deepEqual(stateOf(session, "until").warnings, ["End date rejected"]);
  assert.deepEqual(
    stateOf(session, "note").warnings,
    [],
    "changed between preparing and committing",
  );
  // Neither a touch nor an edit without effect ends it.
  session.touch("until");
  session.edit("until", "2026-02-01");
  assert.equal(session.setErrors("server", [rejection[0]], { from: sent }), true);
  assert.deepEqual(placed(session), { until: ["End date rejected"] });
  session.edit("until", "2026-03-01");
  const before = session.getSnapshot();
  assert.equal(session.setErrors("server", [rejection[1]], { from: sent }), false);
  assert.equal(session.setWarnings("server", [], { from: sent }), false);
  assert.equal(session.getSnapshot(), before);
});

test("After its commit, from is valid until the next change even if another prepare tracks revisions", async () => {
  const session = open();
  const first = await session.prepare();
  assert.equal(session.commit(first), true);
  const second = await session.prepare();
  assert.equal(session.setErrors("audit", [], { from: first }), true);
  session.edit("note", "n");
  assert.equal(session.setErrors("server", rejection, { from: second }), true);
  assert.deepEqual(placed(session), { until: ["End date rejected"], total: ["Total rejected"] });
  // The first one, already accepted, stops placing at the first change of a
  // value, also while the revisions go on for the second.
  const before = session.getSnapshot();
  assert.equal(session.setErrors("audit", rejection, { from: first }), false);
  assert.equal(session.getSnapshot(), before);
  assert.equal(session.commit(second), true);
  session.edit("quantity", 7);
  assert.equal(session.setErrors("audit", rejection, { from: second }), false);
});

test("A prepared submission from another session or an object not returned by prepare throws, and the list is validated before from", async () => {
  const session = open();
  const foreign = await open().prepare();
  const sent = await session.prepare();
  session.reset();
  rejects(
    session,
    () => session.setErrors("server", rejection, { from: foreign }),
    "setErrors: prepared belongs to another session",
  );
  rejects(
    session,
    () => session.setWarnings("server", rejection, { from: { ...sent } }),
    "setWarnings: prepared belongs to another session",
  );
  rejects(
    session,
    () => session.setErrors("server", [{ field: "untill", message: "x" }], { from: sent }),
    'setErrors: field "untill" does not exist',
  );
});
