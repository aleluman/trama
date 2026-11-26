import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

// commit with rows: the rows of the prepared become the baseline, by key; the
// canonical values patch only rows the prepared held; and the rows added,
// removed or moved meanwhile stay as the person left them.
const order = defineForm({
  fields: { rate: field.number({ default: 1 }), note: field.text() },
  collections: {
    lines: {
      fields: {
        quantity: field.number({ default: 1 }),
        amount: field.number(),
        id: field.number(),
      },
    },
    marks: { fields: {} },
  },
  rules: {
    lines: {
      each: {
        amount: { value: ({ quantity }, { values }) => (quantity ?? 0) * (values.rate ?? 0) },
      },
    },
  },
});
const open = (lines = [{}, {}]) => createSession(order, { initial: { lines } });
const keys = (session) => session.getSnapshot().rows.lines;
const row = (session, key) => session.row("lines", key).getSnapshot();
const dirtyOf = (session) => ({
  form: session.getSnapshot().form.dirty,
  lines: session.getSnapshot().form.collections.lines.dirty,
  rows: keys(session).map((key) => row(session, key).dirty),
});

test("rows in the prepared submission enter the baseline clean; rows added later stay new, and reset restores the committed rows", async () => {
  const session = open([{}]);
  const [saved] = keys(session);
  const [added] = session.add("lines", [{ quantity: 2 }]);
  const sent = await session.prepare();
  const [later] = session.add("lines", [{ quantity: 3 }]);
  const handles = [saved, added].map((key) => session.row("lines", key));
  session.commit(sent, { lines: { [added]: { id: 70 } } });
  assert.deepEqual(dirtyOf(session), { form: true, lines: true, rows: [false, false, true] });
  assert.equal(row(session, added).values.id, 70);
  session.reset();
  assert.deepEqual(keys(session), [saved, added]);
  assert.deepEqual(dirtyOf(session), { form: false, lines: false, rows: [false, false] });
  assert.deepEqual(
    [saved, added].map((key) => session.row("lines", key)),
    handles,
  );
  assert.throws(() => session.row("lines", later), { message: /unknown row key/u });
});

test("a row removed after preparing receives its canonical value in the baseline, and reset restores it with the same handle", async () => {
  const session = open([{}]);
  const [added] = session.add("lines", [{ quantity: 2 }]);
  const sent = await session.prepare();
  const handle = session.row("lines", added);
  session.remove("lines", [added]);
  assert.equal(handle.getSnapshot(), undefined);
  assert.equal(session.commit(sent, { lines: { [added]: { id: 9 } } }), true);
  assert.deepEqual(dirtyOf(session), { form: true, lines: true, rows: [false] });
  session.reset();
  assert.equal(session.row("lines", added), handle);
  assert.equal(handle.getSnapshot().values.id, 9);
  assert.equal(handle.getSnapshot().dirty, false);
});

test("a canonical patch with the key of a row added later, an unknown row, or a row from another collection throws without consuming the prepared submission", async () => {
  const session = open([{}]);
  const sent = await session.prepare();
  const [later] = session.add("lines", [{}]);
  const [mark] = session.add("marks", [{}]);
  rejects(
    session,
    () => session.commit(sent, { lines: { [later]: { id: 1 } } }),
    `commit: key "${later}" of "lines" was not in prepared`,
  );
  rejects(
    session,
    () => session.commit(sent, { lines: { r0: { id: 1 } } }),
    'commit: key "r0" of "lines" was not in prepared',
  );
  rejects(
    session,
    () => session.commit(sent, { lines: { [mark]: {} } }),
    `commit: key "${mark}" of "lines" was not in prepared`,
  );
  rejects(
    session,
    () => session.commit(sent, { lines: { [keys(session)[0]]: { idd: 1 } } }),
    `commit: row "${keys(session)[0]}" of "lines": unknown field "idd" in patch`,
  );
  assert.equal(session.commit(sent), true);
});

test("moving a row during transport makes the collection dirty relative to the submitted order, and moving it back clears it", async () => {
  const session = open([{}, {}]);
  const [first, second] = keys(session);
  session.move("lines", second, 0);
  const sent = await session.prepare();
  session.move("lines", second, 1);
  session.commit(sent);
  assert.deepEqual(dirtyOf(session), { form: true, lines: true, rows: [false, false] });
  session.move("lines", first, 1);
  assert.deepEqual(dirtyOf(session), { form: false, lines: false, rows: [false, false] });
});

test("a canonical header rate reaches row amounts except the one edited after preparing", async () => {
  const session = open([{ quantity: 2 }, { quantity: 3 }]);
  const [first, second] = keys(session);
  const sent = await session.prepare();
  session.row("lines", second).edit("amount", 99);
  session.commit(sent, { rate: 10 });
  assert.deepEqual(
    keys(session).map((key) => row(session, key).values.amount),
    [20, 99],
  );
  assert.deepEqual(
    [first, second].map((key) => row(session, key).fieldStates.amount.dirty),
    [false, true],
  );
  session.reset();
  assert.deepEqual(
    keys(session).map((key) => row(session, key).values.amount),
    [20, 30],
  );
});

test("a cell derives again at commit if its formula repeated the directly edited value", async () => {
  const session = open([{ quantity: 2 }]);
  const [key] = keys(session);
  const sent = await session.prepare();
  const line = session.row("lines", key);
  line.edit("amount", 3);
  line.edit("quantity", 3);
  assert.equal(line.getSnapshot().values.amount, 3);

  assert.equal(session.commit(sent, { rate: 10 }), true);
  assert.equal(line.getSnapshot().values.amount, 30);
  assert.equal(line.getSnapshot().fieldStates.amount.dirty, true);
});

test("a formula blocked when adding a row does not remove protection from the supplied amount", async () => {
  const session = open([]);
  const sent = await session.prepare();
  const [key] = session.add("lines", [{ quantity: 2, amount: 2 }]);

  assert.equal(session.commit(sent, { rate: 10 }), true);
  assert.equal(row(session, key).values.amount, 2);
});

test("a cell edited after preparing keeps its value, and the baseline takes the canonical value", async () => {
  const session = open([{ quantity: 2 }]);
  const [key] = keys(session);
  const sent = await session.prepare();
  session.row("lines", key).edit("id", 5);
  session.commit(sent, { lines: { [key]: { id: 4 } } });
  assert.equal(row(session, key).values.id, 5);
  assert.equal(row(session, key).fieldStates.id.dirty, true);
  session.row("lines", key).edit("id", 4);
  assert.deepEqual(dirtyOf(session), { form: false, lines: false, rows: [false] });
});

test("a row with no fields is no longer new once it enters the baseline", async () => {
  const session = createSession(order);
  const [mark] = session.add("marks", [{}]);
  assert.equal(session.row("marks", mark).getSnapshot().dirty, true);
  session.commit(await session.prepare());
  assert.equal(session.row("marks", mark).getSnapshot().dirty, false);
  assert.equal(session.getSnapshot().form.dirty, false);
});

test("an omitted value on a row added after preparing is not an explicit write: an event still writes it", async () => {
  const noted = defineForm({
    fields: { rate: field.number({ default: 1 }) },
    collections: {
      lines: {
        fields: {
          quantity: field.number({ default: 1 }),
          amount: field.number(),
          note: field.text(),
        },
      },
    },
    rules: {
      lines: {
        each: {
          amount: {
            value: ({ quantity }, { values }) => (quantity ?? 0) * (values.rate ?? 0),
            onChange: ({ amount }) => ({ note: `#${amount}` }),
          },
        },
      },
    },
  });
  const session = createSession(noted);
  const sent = await session.prepare();
  const [key] = session.add("lines", [{ quantity: 2 }]);
  assert.equal(row(session, key).values.note, "");
  session.commit(sent, { rate: 5 });
  assert.deepEqual(row(session, key).values, { quantity: 2, amount: 10, note: "#10" });
});
