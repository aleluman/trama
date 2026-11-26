import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import {
  cell,
  errorCounts,
  externals,
  keys,
  lines,
  open,
  row,
  rowAt,
  voucher,
} from "./helpers/external-rows.mjs";
import { rejects } from "./helpers/session.mjs";

// External messages in rows: of a cell, of a row and of a collection, each
// located by the key of its row, never by its position.

test("A cell's external error is published in its row and counted by the scopes that contain it", () => {
  const session = open();
  const before = session.getSnapshot();
  const others = [rowAt(session, 0), rowAt(session, 2)];
  assert.equal(session.setErrors("server", [cell(session, 1, "debit", "Account closed")]), true);
  const snapshot = rowAt(session, 1);
  assert.deepEqual(snapshot.fieldStates.debit.externalErrors, ["Account closed"]);
  assert.deepEqual(snapshot.fieldStates.debit.errors, []);
  assert.deepEqual(snapshot.externalErrors, []);
  assert.equal(snapshot.fieldStates, session.getSnapshot().fieldStates.lines[1]);
  assert.deepEqual(errorCounts(session), [1, 1, [0, 1, 0]]);
  assert.equal(session.getSnapshot().values, before.values);
  assert.equal(session.getSnapshot().form.dirty, false);
  // The other rows keep their snapshot and their states.
  assert.equal(rowAt(session, 0), others[0]);
  assert.equal(rowAt(session, 2), others[1]);
  assert.equal(session.getSnapshot().fieldStates.lines[0], before.fieldStates.lines[0]);
});

test("A row's external error and a collection's external error each belong to their own scope", () => {
  const session = open();
  session.setErrors("server", [
    row(session, 0, "Duplicate line"),
    lines("Unbalanced journal entry"),
  ]);
  session.setWarnings("server", [row(session, 0, "Old line"), lines("Many lines")]);
  const snapshot = rowAt(session, 0);
  assert.deepEqual(snapshot.externalErrors, ["Duplicate line"]);
  assert.deepEqual(snapshot.errors, []);
  assert.deepEqual(snapshot.warnings, ["Old line"]);
  assert.ok(Object.isFrozen(snapshot));
  const { form } = session.getSnapshot();
  assert.deepEqual(form.collections.lines.externalErrors, ["Unbalanced journal entry"]);
  assert.deepEqual(form.collections.lines.errors, []);
  assert.deepEqual(form.collections.lines.warnings, ["Many lines"]);
  assert.deepEqual(form.collections.taxes.externalErrors, []);
  assert.deepEqual(form.externalErrors, []);
  assert.deepEqual(errorCounts(session), [2, 2, [1, 0, 0]]);
  assert.deepEqual([form.warningCount, form.collections.lines.warningCount], [2, 2]);
});

test("A row's own local and external errors count as one destination, and its local warning comes first", () => {
  const session = open({ lines: [{ memo: "w" }] });
  assert.deepEqual(rowAt(session, 0).errors, ["Enter a debit or credit"]);
  assert.deepEqual(errorCounts(session), [1, 1, [1]]);
  session.setErrors("server", [row(session, 0, "Duplicate line")]);
  session.setWarnings("server", [row(session, 0, "Old line"), row(session, 0, "Test memo")]);
  const snapshot = rowAt(session, 0);
  assert.deepEqual(snapshot.errors, ["Enter a debit or credit"]);
  assert.deepEqual(snapshot.externalErrors, ["Duplicate line"]);
  assert.deepEqual(snapshot.warnings, ["Test memo", "Old line"]);
  assert.deepEqual(errorCounts(session), [1, 1, [1]]);
  assert.equal(snapshot.warningCount, 1);
});

test("A source replaces its destinations in rows, collections, and the header in one publication", () => {
  const session = open();
  session.setErrors("server", [
    cell(session, 0, "debit", "A"),
    cell(session, 0, "memo", "B"),
    row(session, 1, "C"),
    lines("D"),
    { field: "note", message: "E" },
    { message: "F" },
  ]);
  assert.deepEqual(externals(session), {
    form: ["F"],
    lines: ["D"],
    "0.debit": ["A"],
    "0.memo": ["B"],
    1: ["C"],
  });
  assert.deepEqual(errorCounts(session), [6, 4, [2, 1, 0]]);
  let heard = 0;
  session.subscribe(() => (heard += 1));
  session.setErrors("server", [cell(session, 2, "credit", "G"), cell(session, 0, "memo", "B")]);
  assert.equal(heard, 1);
  assert.deepEqual(externals(session), { "0.memo": ["B"], "2.credit": ["G"] });
  assert.deepEqual(errorCounts(session), [2, 2, [1, 0, 1]]);
  // The same list publishes nothing.
  session.setErrors("server", [cell(session, 0, "memo", "B"), cell(session, 2, "credit", "G")]);
  assert.equal(heard, 1);
  session.setErrors("server", []);
  assert.equal(heard, 2);
  assert.deepEqual(externals(session), {});
  assert.deepEqual(errorCounts(session), [0, 0, [0, 0, 0]]);
});

test("A row that loses its external messages shares its states again", () => {
  const session = createSession(voucher, { initial: { lines: [{}, {}] } });
  const shared = session.getSnapshot().fieldStates.lines[1];
  assert.equal(session.getSnapshot().fieldStates.lines[0], shared);
  session.setErrors("server", [cell(session, 0, "memo", "B")]);
  assert.notEqual(session.getSnapshot().fieldStates.lines[0], shared);
  assert.equal(session.getSnapshot().fieldStates.lines[0].debit, shared.debit);
  session.setErrors("server", []);
  assert.equal(session.getSnapshot().fieldStates.lines[0], shared);
});

test("The key of an already removed row is omitted and the rest of the list applies", () => {
  const session = open();
  const gone = row(session, 1, "Line rejected");
  const cellGone = cell(session, 1, "debit", "Debit rejected");
  session.remove("lines", [keys(session)[1]]);
  assert.equal(
    session.setErrors("server", [gone, cellGone, cell(session, 0, "debit", "Account closed")]),
    true,
  );
  assert.deepEqual(externals(session), { "0.debit": ["Account closed"] });
  // A list that names only rows that left clears its source.
  assert.equal(session.setErrors("server", [gone]), true);
  assert.deepEqual(externals(session), {});
});

test("A fabricated key or a key from another collection or session is an error and nothing changes", () => {
  const session = open();
  const other = open();
  session.setErrors("server", [lines("Unbalanced journal entry")]);
  const ok = cell(session, 0, "debit", "x");
  const tax = keys(session, "taxes")[0];
  const cases = [
    [{ collection: "lines", key: "r999999999", message: "x" }, "key"],
    [{ collection: "lines", key: "nope", message: "x" }, "key"],
    [{ collection: "lines", key: 3, message: "x" }, "key"],
    [{ collection: "lines", key: tax, message: "x" }, "key"],
    [{ collection: "lines", key: keys(other)[0], message: "x" }, "key"],
    [
      { collection: "lines", key: keys(session)[0], field: "debitt", message: "x" },
      'setErrors: field "debitt" of "lines" does not exist',
    ],
    [
      { collection: "lines", key: keys(session)[0], field: "note", message: "x" },
      'setErrors: field "note" of "lines" does not exist',
    ],
    [
      { collection: "lines", field: "debit", message: "x" },
      'setErrors: a field of "lines" needs its row key',
    ],
    [{ collection: "lined", message: "x" }, 'setErrors: collection "lined" does not exist'],
    [{ collection: 3, message: "x" }, "setErrors: collection 3 does not exist"],
    [{ field: "lines", message: "x" }, 'setErrors: field "lines" does not exist'],
  ];
  for (const [issue, message] of cases)
    rejects(
      session,
      () => session.setErrors("server", [ok, issue]),
      message === "key" ? 'setErrors: key of "lines" belongs to no row of this session' : message,
    );
  assert.deepEqual(externals(session), { lines: ["Unbalanced journal entry"] });
});

test("A row restored by reset is recognized and becomes a destination again", () => {
  const session = open();
  const [first] = keys(session);
  const added = session.add("lines", [{ debit: 1 }])[0];
  session.remove("lines", [first]);
  session.reset();
  assert.deepEqual(keys(session).includes(first), true);
  // The row added and dropped by the reset left: its key is omitted.
  session.setErrors("server", [
    { collection: "lines", key: added, message: "New" },
    { collection: "lines", key: first, message: "First" },
  ]);
  assert.deepEqual(externals(session), { 0: ["First"] });
});

test("The issues from prepare are local, and its warnings include external warnings in visual order", async () => {
  const session = open();
  session.setErrors("server", [
    row(session, 1, "Duplicate line"),
    lines("Unbalanced journal entry"),
  ]);
  session.setWarnings("server", [
    cell(session, 2, "memo", "Short memo"),
    row(session, 0, "Old line"),
    lines("Many lines"),
  ]);
  const [first, , third] = keys(session);
  const ready = await session.prepare();
  assert.equal(ready.status, "ready");
  assert.deepEqual(ready.warnings, [
    { collection: "lines", message: "Many lines" },
    { collection: "lines", key: first, message: "Old line" },
    { collection: "lines", key: third, field: "memo", message: "Short memo" },
  ]);
  session.row("lines", third).edit("credit", 0);
  const invalid = await session.prepare();
  assert.deepEqual(invalid, {
    status: "invalid",
    issues: [{ collection: "lines", key: third, message: "Enter a debit or credit" }],
  });
});

test("An external warning that matches its cell's local warning remains when the local warning is withdrawn", () => {
  // The local warning of the memo reads the header: changing the note takes
  // it away without writing the cell.
  const form = defineForm({
    fields: { note: field.text() },
    collections: { lines: { fields: { memo: field.text() } } },
    rules: {
      lines: { each: { memo: { warning: (_, { values }) => values.note === "a" && "Warning" } } },
    },
  });
  const session = createSession(form, { initial: { note: "a", lines: [{}, {}] } });
  const [first] = session.getSnapshot().rows.lines;
  const memo = () => session.row("lines", first).getSnapshot().fieldStates.memo;
  session.setWarnings("server", [
    { collection: "lines", key: first, field: "memo", message: "Warning" },
  ]);
  assert.deepEqual(memo().warnings, ["Warning"]);
  session.edit("note", "b");
  assert.deepEqual(memo().warnings, ["Warning"]);
  assert.equal(session.row("lines", first).getSnapshot().warningCount, 1);
  assert.equal(session.getSnapshot().form.warningCount, 1);
});
