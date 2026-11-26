import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";
import { heard, rejects } from "./helpers/session.mjs";

// touch marks a field, a cell or a row: the state of the field and the
// snapshot of the row publish touched. Only touch marks, a repeated touch
// publishes nothing, and reset clears every mark.
const sheet = defineForm({
  fields: {
    title: field.text({ required: true }),
    note: field.text(),
    total: field.number(),
  },
  collections: {
    lines: { fields: { amount: field.number({ required: true }), memo: field.text() } },
  },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
  },
});
const initial = { title: "", lines: [{ amount: 1 }, { amount: null }] };
const keys = (session) => session.getSnapshot().rows.lines;
const touched = (states) =>
  Object.fromEntries(Object.entries(states).map(([name, state]) => [name, state.touched]));

test("every field publishes touched as false, and editing does not touch it", () => {
  const session = createSession(sheet, { initial });
  const { fieldStates } = session.getSnapshot();
  assert.deepEqual(touched({ title: fieldStates.title, note: fieldStates.note }), {
    title: false,
    note: false,
  });
  session.edit("note", "x");
  const [first] = keys(session);
  session.row("lines", first).edit("memo", "y");
  assert.equal(session.getSnapshot().fieldStates.note.touched, false);
  const row = session.row("lines", first).getSnapshot();
  assert.deepEqual(touched(row.fieldStates), { amount: false, memo: false });
  assert.equal(row.touched, false);
});

test("touch marks a header field and publishes once, and repeating it does not publish", () => {
  const session = createSession(sheet, { initial });
  const before = session.getSnapshot();
  const snapshots = heard(session);
  session.touch("title");
  assert.equal(snapshots.length, 1);
  const after = session.getSnapshot();
  assert.equal(after.fieldStates.title.touched, true);
  assert.deepEqual(after.fieldStates.title.errors, before.fieldStates.title.errors);
  // The values, the other states and the form keep their objects.
  assert.equal(after.values, before.values);
  assert.equal(after.fieldStates.note, before.fieldStates.note);
  assert.equal(after.form, before.form);
  session.touch("title");
  assert.equal(snapshots.length, 1);
  assert.equal(session.getSnapshot(), after);
});

test("a touched field stays touched when its value or combined state changes, and dirty is compared the same way", () => {
  const form = defineForm({
    fields: { locked: field.checkbox(), name: field.text({ required: true }) },
    rules: { name: { disabled: ({ locked }) => locked } },
  });
  const session = createSession(form);
  const name = () => session.getSnapshot().fieldStates.name;
  session.touch("name");
  session.edit("name", "Ana");
  assert.deepEqual([name().touched, name().dirty, name().errors], [true, true, []]);
  session.edit("locked", true);
  assert.deepEqual([name().touched, name().disabled], [true, true]);
  session.edit("name", "");
  assert.deepEqual([name().touched, name().dirty, name().errors], [true, false, ["Required"]]);
});

test("row.touch(name) marks the cell and row, and other rows retain their snapshots", () => {
  const session = createSession(sheet, { initial });
  const [first, second] = keys(session);
  const other = session.row("lines", second).getSnapshot();
  const snapshots = heard(session);
  session.row("lines", first).touch("amount");
  assert.equal(snapshots.length, 1);
  const row = session.row("lines", first).getSnapshot();
  assert.deepEqual(touched(row.fieldStates), { amount: true, memo: false });
  assert.equal(row.touched, true);
  assert.equal(session.getSnapshot().fieldStates.lines[0].amount.touched, true);
  assert.equal(session.row("lines", second).getSnapshot(), other);
  session.row("lines", first).touch("amount");
  assert.equal(snapshots.length, 1);
  // Another cell of the same row keeps the first mark, also once the first derives again.
  session.row("lines", first).touch("memo");
  session.row("lines", first).edit("amount", 3);
  const both = session.row("lines", first).getSnapshot().fieldStates;
  assert.deepEqual(touched(both), { amount: true, memo: true });
});

test("two equal cells share their state until one is touched", () => {
  const session = createSession(sheet, { initial: { lines: [{ amount: 1 }, { amount: 1 }] } });
  const [first, second] = keys(session);
  const state = (key) => session.row("lines", key).getSnapshot().fieldStates;
  assert.equal(state(first), state(second));
  session.row("lines", first).touch("memo");
  assert.notEqual(state(first).memo, state(second).memo);
  assert.equal(state(first).amount, state(second).amount);
});

test("row.touch() marks only the row and notifies without publishing another session or other states", () => {
  const session = createSession(sheet, { initial });
  const [first, second] = keys(session);
  const before = session.getSnapshot();
  const fieldStates = session.row("lines", first).getSnapshot().fieldStates;
  const other = session.row("lines", second).getSnapshot();
  let calls = 0;
  session.subscribe(() => calls++);
  session.row("lines", first).touch();
  assert.equal(calls, 1);
  assert.equal(session.getSnapshot(), before);
  const row = session.row("lines", first).getSnapshot();
  assert.equal(row.touched, true);
  assert.equal(row.fieldStates, fieldStates);
  assert.equal(session.row("lines", second).getSnapshot(), other);
  session.row("lines", first).touch();
  assert.equal(calls, 1);
  // A cell of a row already touched marks the cell, and notifies once.
  session.row("lines", first).touch("memo");
  assert.equal(calls, 2);
});

test("reset clears the field, cell, and row markers", () => {
  const session = createSession(sheet, { initial });
  const [first, second] = keys(session);
  session.touch("title");
  session.row("lines", first).touch("amount");
  session.row("lines", second).touch();
  // The handles read their snapshots before the reset, and keep them across it.
  const handles = [session.row("lines", first), session.row("lines", second)];
  assert.deepEqual(
    handles.map((handle) => handle.getSnapshot().touched),
    [true, true],
  );
  session.reset();
  assert.deepEqual(
    handles.map((handle) => handle.getSnapshot().touched),
    [false, false],
  );
  assert.equal(session.getSnapshot().fieldStates.title.touched, false);
  assert.equal(session.row("lines", first).getSnapshot().fieldStates.amount.touched, false);
  assert.equal(session.row("lines", first).getSnapshot().touched, false);
  assert.equal(session.row("lines", second).getSnapshot().touched, false);
  // Touching again marks again.
  session.touch("title");
  assert.equal(session.getSnapshot().fieldStates.title.touched, true);
});

test("commit retains the markers, and a later reset clears them", async () => {
  const session = createSession(sheet, { initial: { title: "Sheet", lines: [{ amount: 1 }] } });
  const [first] = keys(session);
  session.touch("note");
  session.row("lines", first).touch();
  const sent = await session.prepare();
  session.touch("title");
  assert.equal(session.commit(sent, { note: "server" }), true);
  assert.equal(session.getSnapshot().fieldStates.note.touched, true);
  assert.equal(session.getSnapshot().fieldStates.title.touched, true);
  assert.equal(session.row("lines", first).getSnapshot().touched, true);
  // A reset clears the marks, also after a commit, and restores the confirmed values.
  session.reset();
  assert.equal(session.getSnapshot().fieldStates.note.touched, false);
  assert.equal(session.getSnapshot().values.note, "server");
});

test("touch does not cancel a prepare that waits for a necessary query", async () => {
  const notes = defineEndpoints({ note: endpoint.value(() => Promise.resolve("Suggested")) });
  const { defineForm: bound, field: kind } = createForms({ endpoints: [notes] });
  const form = bound({
    fields: { day: kind.number({ default: 1 }), note: kind.text() },
    rules: {
      note: { query: { endpoint: "note", params: ({ day }) => ({ day }), forPrepare: true } },
    },
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(form, { scope: "acme", loader });
  const pending = session.prepare();
  session.touch("day");
  await calls[0].resolve();
  const result = await pending;
  assert.equal(result.status, "ready");
  assert.equal(result.values.note, "Suggested");
});

test("an added row is untouched, and removing a touched row leaves no markers", () => {
  const session = createSession(sheet, { initial });
  const [first] = keys(session);
  session.row("lines", first).touch("amount");
  session.remove("lines", [first]);
  const [added] = session.add("lines", [{ amount: 2 }]);
  const row = session.row("lines", added).getSnapshot();
  assert.equal(row.touched, false);
  assert.equal(row.fieldStates.amount.touched, false);
  session.reset();
  assert.equal(session.row("lines", first).getSnapshot().fieldStates.amount.touched, false);
});

test("touch checks the guard, field, and row without publishing", () => {
  const session = createSession(sheet, { initial });
  const [first] = keys(session);
  rejects(session, () => session.touch("absent"), 'touch: field "absent" does not exist');
  rejects(session, () => session.touch("lines"), 'touch: field "lines" does not exist');
  rejects(
    session,
    () => session.row("lines", first).touch("absent"),
    'Collection "lines": touch: field "absent" does not exist',
  );
  const handle = session.row("lines", first);
  session.remove("lines", [first]);
  rejects(session, () => handle.touch(), `Collection "lines": row "${first}" was removed`);
  rejects(session, () => handle.touch("amount"), `Collection "lines": row "${first}" was removed`);
  const stop = session.subscribe(() => {
    assert.throws(() => session.touch("note"), {
      message: "Cannot touch a session during its notification",
    });
  });
  session.edit("note", "x");
  stop();
});
