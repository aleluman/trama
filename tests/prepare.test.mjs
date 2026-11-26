import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

// prepare without queries: what it captures, how it orders the problems, the
// attempt it marks and the diagnostics of its options.

// A document with a header and lines: its own messages in every scope.
const voucher = defineForm({
  fields: { date: field.date({ required: true }), note: field.text(), total: field.number() },
  collections: {
    lines: {
      fields: { debit: field.number(), credit: field.number(), quantity: field.number() },
    },
  },
  form: { error: ({ note }) => note === "x" && "The form does not accept x" },
  rules: {
    note: { warning: ({ note }) => note === "" && "No note" },
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.debit ?? 0), 0) },
    lines: {
      collection: { error: ({ lines }) => lines.length === 0 && "Add at least one line" },
      row: {
        error: ({ debit, credit }) =>
          (debit ?? 0) === 0 && (credit ?? 0) === 0 && "Enter the debit or credit",
      },
      each: {
        quantity: {
          error: ({ quantity }) => quantity !== null && quantity < 0 && "Negative quantity",
          warning: ({ quantity }) => (quantity ?? 0) > 100 && "More than 100 units",
        },
        debit: { required: ({ credit }) => credit === null && "Debit or credit" },
      },
    },
  },
});
const valid = { date: "2026-11-02", note: "Purchase", lines: [{ debit: 10, quantity: 1 }] };

test("prepare returns ready for a valid form with the published values, rows, and warnings without waiting", async () => {
  const session = createSession(voucher, {
    initial: { ...valid, note: "", lines: [{ debit: 5, quantity: 200 }, { debit: 1 }] },
  });
  const before = session.getSnapshot();
  const [first] = before.rows.lines;
  const result = await session.prepare();
  assert.equal(result.status, "ready");
  assert.equal(result.values, before.values);
  assert.equal(result.rows, before.rows);
  assert.deepEqual(result.warnings, [
    { field: "note", message: "No note" },
    { collection: "lines", key: first, field: "quantity", message: "More than 100 units" },
  ]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.warnings));
  assert.ok(result.warnings.every((issue) => Object.isFrozen(issue)));
  assert.deepEqual(Object.keys(result), ["status", "values", "rows", "warnings"]);
});

test("a local error returns invalid with problems in visual order, even after moving rows, and without warnings", async () => {
  const session = createSession(voucher, {
    initial: { date: null, note: "x", lines: [{ debit: 1 }, {}, { quantity: -1, credit: 2 }] },
  });
  const [first, second, third] = session.getSnapshot().rows.lines;
  session.move("lines", third, 0);
  session.row("lines", first).edit("quantity", 500);
  const result = await session.prepare();
  assert.deepEqual(result, {
    status: "invalid",
    issues: [
      { message: "The form does not accept x" },
      { field: "date", message: "Required" },
      { collection: "lines", key: third, field: "quantity", message: "Negative quantity" },
      { collection: "lines", key: second, message: "Enter the debit or credit" },
      { collection: "lines", key: second, field: "debit", message: "Debit or credit" },
    ],
  });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.issues));
  session.remove("lines", [first, second, third]);
  const empty = await session.prepare();
  assert.deepEqual(empty.issues.slice(1), [
    { field: "date", message: "Required" },
    { collection: "lines", message: "Add at least one line" },
  ]);
});

test("application messages appear in problems, and a target with two messages produces two problems in order", async () => {
  const { defineForm: bound, field: kind } = createForms({
    endpoints: [],
    messages: { required: ({ label }) => `${label} is required` },
  });
  const form = bound({
    fields: { code: kind.text({ label: "Code", required: true }) },
    rules: { code: { error: [() => "First", () => "Second"] } },
  });
  const result = await createSession(form).prepare();
  assert.deepEqual(result.issues, [
    { field: "code", message: "Code is required" },
    { field: "code", message: "First" },
    { field: "code", message: "Second" },
  ]);
});

test("prepare captures immediately, so later edits do not enter the prepared submission", async () => {
  const session = createSession(voucher, { initial: valid });
  const pending = session.prepare();
  session.edit("note", "Another");
  const result = await pending;
  assert.equal(result.status, "ready");
  assert.equal(result.values.note, "Purchase");
  assert.equal(session.getSnapshot().values.note, "Another");
});

test("prepare marks the attempt in form.attempted and row.attempted for existing rows, and a new row does not inherit it until another attempt", async () => {
  const session = createSession(voucher, { initial: valid });
  const attempted = () => ({
    form: session.getSnapshot().form.attempted,
    rows: session
      .getSnapshot()
      .rows.lines.map((key) => session.row("lines", key).getSnapshot().attempted),
  });
  assert.deepEqual(attempted(), { form: false, rows: [false] });
  const notified = [];
  const stop = session.subscribe(() => notified.push(session.getSnapshot()));
  const before = session.getSnapshot();
  const pending = session.prepare();
  // The attempt publishes at once, before the result, with the same values.
  assert.equal(notified.length, 1);
  assert.equal(notified[0].values, before.values);
  assert.equal(notified[0].fieldStates, before.fieldStates);
  assert.deepEqual(attempted(), { form: true, rows: [true] });
  await pending;
  session.add("lines", [{ debit: 1 }]);
  assert.deepEqual(attempted(), { form: true, rows: [true, false] });
  const heard = notified.length;
  await session.prepare();
  // The new row changed its mark: the subscribers hear it.
  assert.equal(notified.length, heard + 1);
  assert.deepEqual(attempted(), { form: true, rows: [true, true] });
  stop();
  // A prepare that changes no mark publishes nothing.
  const counted = [];
  const quiet = session.subscribe(() => counted.push(1));
  await session.prepare();
  quiet();
  assert.deepEqual(counted, []);
  session.reset();
  assert.deepEqual(attempted(), { form: false, rows: [false] });
});

test("an attempted form retains its identity and those of its collections as long as it is unchanged", async () => {
  const session = createSession(voucher, { initial: valid });
  const quiet = session.getSnapshot().form;
  await session.prepare();
  const attempted = session.getSnapshot().form;
  assert.notEqual(attempted, quiet);
  assert.deepEqual({ ...attempted, attempted: false }, { ...quiet });
  assert.equal(attempted.collections, quiet.collections);
  const [key] = session.getSnapshot().rows.lines;
  const row = session.row("lines", key).getSnapshot();
  // An edit without effect keeps it; one that changes the form gives another, attempted.
  session.edit("note", "Purchase");
  assert.equal(session.getSnapshot().form, attempted);
  session.edit("note", "Another");
  assert.equal(session.getSnapshot().form.attempted, true);
  assert.equal(session.getSnapshot().form.dirty, true);
  assert.equal(session.row("lines", key).getSnapshot(), row);
});

test("prepare checks its options and does not run during session notification", () => {
  const session = createSession(voucher, { initial: valid });
  rejects(session, () => session.prepare(5), "prepare: options must be an object");
  rejects(session, () => session.prepare({ sigal: undefined }), 'prepare: unknown option "sigal"');
  for (const signal of [5, {}, { aborted: false }])
    rejects(session, () => session.prepare({ signal }), "prepare: signal must be an AbortSignal");
  let failure;
  const stop = session.subscribe(() => {
    try {
      session.prepare();
    } catch (error) {
      failure = error;
    }
  });
  session.edit("note", "Another");
  stop();
  assert.equal(failure?.message, "Cannot prepare a session during its notification");
  assert.equal(session.getSnapshot().form.attempted, false);
  // Without options and with an undefined signal, it prepares.
  assert.doesNotThrow(() => session.prepare({ signal: undefined }));
});

test("prepare does not publish if no marker changes, even if this or another session assigned row keys", async () => {
  const session = createSession(voucher, { initial: valid });
  await session.prepare();
  const before = session.getSnapshot();
  let heard = 0;
  session.subscribe(() => heard++);
  createSession(voucher, { initial: valid });
  const [added] = session.add("lines", [{ debit: 1 }]);
  session.remove("lines", [added]);
  heard = 0;
  const removed = session.getSnapshot();
  await session.prepare();
  assert.equal(heard, 0);
  assert.equal(session.getSnapshot(), removed);
  assert.equal(before.form.attempted, true);
});
