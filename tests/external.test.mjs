import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { counts, external, heard, open, report, stateOf } from "./helpers/external.mjs";

// External errors and warnings of the header and of the form: messages the
// application gives from outside the rules, as the response of its server,
// per source. They are published apart from the local errors, count their
// destination once with them, and each call replaces what its source gave.

test("Every state publishes empty externalErrors by default, and state without external messages keeps its previous behavior", () => {
  const session = open();
  const { form, fieldStates } = session.getSnapshot();
  assert.deepEqual(form.externalErrors, []);
  for (const name of Object.keys(report.fields))
    assert.deepEqual(fieldStates[name].externalErrors, [], name);
  assert.equal(fieldStates.note.externalErrors, fieldStates.since.externalErrors);
});

test("setErrors places a source's error on a field and publishes it separately, once, without changing values or marking the field or form dirty", () => {
  const session = open();
  const before = session.getSnapshot();
  const snapshots = heard(session);
  const accepted = session.setErrors("server", [{ field: "until", message: "Period closed" }]);
  assert.equal(accepted, true);
  assert.equal(snapshots.length, 1);
  const after = session.getSnapshot();
  assert.equal(after.values, before.values);
  assert.deepEqual(external(session, "until"), ["Period closed"]);
  assert.deepEqual(stateOf(session, "until").errors, []);
  assert.equal(stateOf(session, "until").dirty, false);
  assert.ok(Object.isFrozen(stateOf(session, "until")));
  assert.ok(Object.isFrozen(external(session, "until")));
  assert.deepEqual(counts(session), [1, 0]);
  assert.equal(after.form.dirty, false);
  // The other fields keep their state.
  for (const name of ["since", "note", "quantity", "total"])
    assert.equal(after.fieldStates[name], before.fieldStates[name], name);
});

test("An issue without a location belongs to the form", () => {
  const session = open();
  const before = session.getSnapshot();
  session.setErrors("server", [{ message: "Could not generate" }]);
  const { form, fieldStates } = session.getSnapshot();
  assert.deepEqual(form.externalErrors, ["Could not generate"]);
  assert.deepEqual(form.errors, []);
  assert.deepEqual(counts(session), [1, 0]);
  assert.equal(fieldStates, before.fieldStates);
  assert.ok(Object.isFrozen(form));
});

test("Each call replaces what its source contributed, and an empty list clears it", () => {
  const session = open();
  const before = session.getSnapshot();
  session.setErrors("server", [
    { field: "until", message: "Period closed" },
    { field: "note", message: "Note rejected" },
    { message: "Report rejected" },
  ]);
  assert.deepEqual(counts(session), [3, 0]);
  session.setErrors("server", [{ field: "since", message: "Start date rejected" }]);
  assert.deepEqual(external(session, "until"), []);
  assert.deepEqual(external(session, "note"), []);
  assert.deepEqual(external(session, "since"), ["Start date rejected"]);
  assert.deepEqual(session.getSnapshot().form.externalErrors, []);
  assert.deepEqual(counts(session), [1, 0]);
  // A field without externals publishes the state it had.
  assert.equal(stateOf(session, "until"), before.fieldStates.until);
  session.setErrors("server", []);
  assert.deepEqual(counts(session), [0, 0]);
  assert.equal(session.getSnapshot().fieldStates, before.fieldStates);
  assert.deepEqual(session.getSnapshot().form, before.form);
});

test("Sources do not erase each other's messages even when they supply the same text, and a message is published once", () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  session.setErrors("audit", [
    { field: "until", message: "Rejected" },
    { field: "until", message: "Outside the audit" },
  ]);
  assert.deepEqual(external(session, "until"), ["Rejected", "Outside the audit"]);
  session.setErrors("server", []);
  assert.deepEqual(external(session, "until"), ["Rejected", "Outside the audit"]);
  session.setErrors("audit", []);
  assert.deepEqual(external(session, "until"), []);
});

test("External messages follow the order in which their sources were first accepted, then each source's list order. Replacing a source's contribution preserves its position", () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "S1" }]);
  session.setErrors("audit", [
    { field: "until", message: "A1" },
    { field: "until", message: "A2" },
  ]);
  assert.deepEqual(external(session, "until"), ["S1", "A1", "A2"]);
  session.setErrors("server", [
    { field: "until", message: "S3" },
    { field: "until", message: "S2" },
    { field: "until", message: "S3" },
  ]);
  assert.deepEqual(external(session, "until"), ["S3", "S2", "A1", "A2"]);
  // A source that leaves and comes back keeps its place.
  session.setErrors("server", []);
  session.setErrors("server", [{ field: "until", message: "S4" }]);
  assert.deepEqual(external(session, "until"), ["S4", "A1", "A2"]);
  session.setErrors("server", [{ message: "SF" }]);
  session.setErrors("audit", [{ message: "AF" }]);
  assert.deepEqual(session.getSnapshot().form.externalErrors, ["SF", "AF"]);
});

test("setWarnings adds external warnings after local ones, and errors from the same source use a separate channel", () => {
  const session = open({ until: "2031-01-01" });
  assert.deepEqual(stateOf(session, "until").warnings, ["Too far away"]);
  assert.deepEqual(counts(session), [0, 1]);
  assert.equal(
    session.setWarnings("server", [
      { field: "until", message: "Holiday" },
      { field: "until", message: "Too far away" },
      { field: "note", message: "No note" },
      { message: "Slow report" },
    ]),
    true,
  );
  assert.deepEqual(stateOf(session, "until").warnings, ["Too far away", "Holiday"]);
  assert.deepEqual(stateOf(session, "note").warnings, ["No note"]);
  assert.deepEqual(session.getSnapshot().form.warnings, ["Slow report"]);
  assert.deepEqual(external(session, "until"), []);
  assert.deepEqual(counts(session), [0, 3]);
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  assert.deepEqual(counts(session), [1, 3]);
  // Clearing the errors of a source keeps its warnings, and the other way.
  session.setErrors("server", []);
  assert.deepEqual(stateOf(session, "until").warnings, ["Too far away", "Holiday"]);
  assert.deepEqual(counts(session), [0, 3]);
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  session.setWarnings("server", []);
  assert.deepEqual(stateOf(session, "until").warnings, ["Too far away"]);
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  assert.deepEqual(counts(session), [1, 1]);
});

test("The form's own warning comes before its external warnings", () => {
  const session = open({ note: "x" });
  session.setWarnings("server", [{ message: "Slow report" }, { message: "Test note" }]);
  assert.deepEqual(session.getSnapshot().form.warnings, ["Test note", "Slow report"]);
  assert.deepEqual(counts(session), [0, 1]);
});

test("A local error and an external error on the same field count as one destination, even with several messages", () => {
  const session = open({ since: null });
  assert.deepEqual(stateOf(session, "since").errors, ["Required"]);
  assert.deepEqual(counts(session), [1, 0]);
  session.setErrors("server", [
    { field: "since", message: "Start date rejected" },
    { field: "since", message: "Other" },
  ]);
  assert.deepEqual(stateOf(session, "since").errors, ["Required"]);
  assert.deepEqual(external(session, "since"), ["Start date rejected", "Other"]);
  assert.deepEqual(counts(session), [1, 0]);
  // The external one stays when the local one leaves, and still counts.
  session.setErrors("audit", [{ field: "note", message: "Note" }]);
  assert.deepEqual(counts(session), [2, 0]);
});

test("A replacement that changes nothing does not publish and returns true", () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "Rejected" }, { message: "General" }]);
  session.setWarnings("server", [{ field: "note", message: "Warning" }]);
  const before = session.getSnapshot();
  const snapshots = heard(session);
  assert.equal(
    session.setErrors("server", [{ message: "General" }, { field: "until", message: "Rejected" }]),
    true,
  );
  assert.equal(session.setWarnings("server", [{ field: "note", message: "Warning" }]), true);
  assert.equal(session.setErrors("audit", []), true);
  assert.equal(snapshots.length, 0);
  assert.equal(session.getSnapshot(), before);
});

test("A replacement preserves lists that do not change", () => {
  const session = open();
  session.setErrors("server", [
    { field: "until", message: "Rejected" },
    { field: "note", message: "Note" },
  ]);
  const before = session.getSnapshot();
  session.setErrors("server", [
    { field: "until", message: "Rejected" },
    { field: "note", message: "Another note" },
  ]);
  assert.equal(stateOf(session, "until"), before.fieldStates.until);
  assert.notEqual(stateOf(session, "note"), before.fieldStates.note);
  assert.equal(session.getSnapshot().form, before.form);
});

test("A field can have the same name as an issue property", () => {
  const names = ["form", "message", "key", "collection", "field"];
  const session = createSession(
    defineForm({ fields: Object.fromEntries(names.map((name) => [name, field.text()])) }),
  );
  session.setErrors("server", [
    ...names.map((name) => ({ field: name, message: `From ${name}` })),
    { message: "General" },
  ]);
  const { form, fieldStates } = session.getSnapshot();
  for (const name of names) assert.deepEqual(fieldStates[name].externalErrors, [`From ${name}`]);
  assert.deepEqual(form.externalErrors, ["General"]);
  assert.equal(form.errorCount, 6);
});
