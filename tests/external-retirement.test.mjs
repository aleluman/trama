import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { counts, external, heard, open, stateOf } from "./helpers/external.mjs";

// When the external messages of the header leave: with the value of their
// field, whoever changes it, and all of them at reset; those of the form stay
// until their source replaces them. They block no prepare, and the marks of a
// field live with them.

test("Changing a field withdraws only its own external messages, from all sources and both channels", () => {
  const session = open();
  session.setErrors("server", [
    { field: "until", message: "Rejected" },
    { field: "note", message: "Note rejected" },
    { message: "General" },
  ]);
  session.setErrors("audit", [{ field: "until", message: "Audit" }]);
  session.setWarnings("server", [{ field: "until", message: "Warning" }]);
  assert.deepEqual(counts(session), [3, 1]);
  const snapshots = heard(session);
  session.edit("until", "2026-03-01");
  assert.equal(snapshots.length, 1);
  assert.deepEqual(external(session, "until"), []);
  assert.deepEqual(stateOf(session, "until").warnings, []);
  assert.deepEqual(external(session, "note"), ["Note rejected"]);
  assert.deepEqual(session.getSnapshot().form.externalErrors, ["General"]);
  assert.deepEqual(counts(session), [2, 0]);
  // Back to its value: they do not come back.
  session.edit("until", "2026-02-01");
  assert.deepEqual(external(session, "until"), []);
  // A later replacement of another destination does not bring them back.
  session.setErrors("audit", [{ field: "since", message: "From" }]);
  assert.deepEqual(external(session, "until"), []);
  assert.deepEqual(external(session, "since"), ["From"]);
});

test("A no-op edit leaves external messages in place, and a formula change withdraws them", () => {
  const session = open();
  session.setErrors("server", [
    { field: "until", message: "Rejected" },
    { field: "total", message: "Total rejected" },
    { field: "quantity", message: "Quantity rejected" },
  ]);
  const before = session.getSnapshot();
  session.edit("until", "2026-02-01");
  assert.equal(session.getSnapshot().fieldStates, before.fieldStates);
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 6);
  assert.deepEqual(external(session, "total"), []);
  assert.deepEqual(external(session, "quantity"), []);
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  assert.deepEqual(counts(session), [1, 0]);
});

test("patch withdraws the external messages of each field that changed", () => {
  const session = open();
  session.setErrors("server", [
    { field: "until", message: "Rejected" },
    { field: "note", message: "Note rejected" },
    { field: "since", message: "Start date rejected" },
  ]);
  session.patch({ until: "2026-03-01", note: "", since: "2026-01-03" });
  assert.deepEqual(external(session, "until"), []);
  assert.deepEqual(external(session, "note"), ["Note rejected"], "note did not change");
  assert.deepEqual(external(session, "since"), []);
});

test("reset withdraws all external messages, including the form's own, and the source starts over", () => {
  const session = open();
  const opened = session.getSnapshot();
  session.setErrors("server", [{ field: "until", message: "S" }, { message: "General" }]);
  session.setErrors("audit", [{ field: "until", message: "A" }]);
  session.setWarnings("server", [{ field: "note", message: "Warning" }, { message: "Slow" }]);
  session.reset();
  const after = session.getSnapshot();
  assert.equal(after.fieldStates.until, opened.fieldStates.until);
  assert.equal(after.fieldStates.note, opened.fieldStates.note);
  assert.deepEqual(after.form.externalErrors, []);
  assert.deepEqual(after.form.warnings, []);
  assert.deepEqual(counts(session), [0, 0]);
  // The order of the sources starts again.
  session.setErrors("audit", [{ field: "until", message: "A" }]);
  session.setErrors("server", [{ field: "until", message: "S" }]);
  assert.deepEqual(external(session, "until"), ["A", "S"]);
});

test("A failed reset changes nothing and the source still knows where it placed its messages", () => {
  let failing = false;
  const boom = new Error("Rate unavailable");
  const form = defineForm({
    fields: { rate: field.number({ default: 1 }), note: field.text() },
    rules: {
      rate: {
        disabled: ({ rate }) => {
          if (failing) throw boom;
          return rate === 0;
        },
      },
    },
  });
  const session = createSession(form);
  session.setErrors("server", [{ field: "note", message: "S" }, { message: "General" }]);
  session.touch("note");
  // The reset has to run the rule of the rate again, with the rate of the baseline.
  session.edit("rate", 2);
  failing = true;
  const before = session.getSnapshot();
  assert.throws(() => session.reset());
  assert.equal(session.getSnapshot(), before);
  failing = false;
  // The source still knows its destinations, so clearing it clears them.
  assert.equal(session.setErrors("server", []), true);
  assert.deepEqual(session.getSnapshot().fieldStates.note.externalErrors, []);
  assert.deepEqual(session.getSnapshot().form.externalErrors, []);
  assert.equal(session.getSnapshot().fieldStates.note.touched, true);
});

test("The form's own external messages remain until their source replaces them", () => {
  const session = open();
  session.setErrors("server", [{ message: "General" }]);
  session.setWarnings("server", [{ message: "Slow" }]);
  session.patch({ since: "2026-01-05", until: "2026-03-01", note: "y", quantity: 9 });
  assert.deepEqual(session.getSnapshot().form.externalErrors, ["General"]);
  assert.deepEqual(session.getSnapshot().form.warnings, ["Slow"]);
  session.setErrors("server", []);
  assert.deepEqual(session.getSnapshot().form.externalErrors, []);
  assert.deepEqual(session.getSnapshot().form.warnings, ["Slow"]);
});

test("External messages do not block prepare, and invalid includes only local issues", async () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "Rejected" }, { message: "General" }]);
  session.setWarnings("server", [{ field: "note", message: "Warning" }, { message: "Slow" }]);
  assert.deepEqual(counts(session), [2, 2]);
  const ready = await session.prepare();
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.warnings, [{ message: "Slow" }, { field: "note", message: "Warning" }]);
  // They stay after preparing.
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  session.setErrors("server", [{ field: "since", message: "Start date rejected" }]);
  session.edit("until", "2025-01-01");
  const invalid = await session.prepare();
  assert.deepEqual(invalid, {
    status: "invalid",
    issues: [{ field: "until", message: "To is before From" }],
  });
});

test("Touching does not withdraw external messages, and touched state is preserved when they are withdrawn", () => {
  const session = open();
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  session.touch("until");
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  assert.equal(stateOf(session, "until").touched, true);
  // The mark stays when the external leaves.
  session.setErrors("server", []);
  assert.equal(stateOf(session, "until").touched, true);
  assert.deepEqual(external(session, "until"), []);
});

test("A pending input error is local and can coexist with an external error on the same field", () => {
  const session = open();
  const view = session.input("until");
  view.error("Incomplete date");
  session.setErrors("server", [{ field: "until", message: "Rejected" }]);
  assert.deepEqual(stateOf(session, "until").errors, ["Incomplete date"]);
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  assert.deepEqual(counts(session), [1, 0]);
  view.error();
  assert.deepEqual(stateOf(session, "until").errors, []);
  assert.deepEqual(external(session, "until"), ["Rejected"]);
  assert.equal(session.getSnapshot().form.inputPending, false);
  assert.deepEqual(counts(session), [1, 0]);
});

test("An edit that produces invalid bounds is rejected and preserves external messages", () => {
  const strict = defineForm({
    fields: { low: field.number({ min: 0 }), note: field.text() },
    rules: { low: { max: ({ note }) => (note === "bad" ? -5 : undefined) } },
  });
  const session = createSession(strict, { initial: { low: 1 } });
  session.setErrors("server", [
    { field: "note", message: "Note rejected" },
    { field: "low", message: "Low value rejected" },
  ]);
  const before = session.getSnapshot();
  assert.throws(() => session.edit("note", "bad"));
  assert.equal(session.getSnapshot(), before);
  // A later operation does not reveal the rejected retirement.
  session.edit("low", 2);
  assert.deepEqual(session.getSnapshot().fieldStates.note.externalErrors, ["Note rejected"]);
  assert.deepEqual(session.getSnapshot().fieldStates.low.externalErrors, []);
});

test("commit keeps an external error on a field whose current value stays the same even if its baseline changes", async () => {
  const session = open();
  session.edit("note", "edited before preparing");
  const sent = await session.prepare();
  session.setErrors("server", [
    { field: "note", message: "Note rejected" },
    { field: "until", message: "End date rejected" },
  ]);
  assert.equal(session.commit(sent, { until: "2026-04-01" }), true);
  // The baseline of note changed, not its value; the canonical one changed until.
  assert.equal(stateOf(session, "note").dirty, false);
  assert.deepEqual(external(session, "note"), ["Note rejected"]);
  assert.deepEqual(external(session, "until"), []);
});
