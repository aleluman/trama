import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as nextTask } from "node:timers/promises";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const order = () =>
  defineForm({
    fields: { note: field.text(), limit: field.number() },
    collections: { lines: { fields: { price: field.number({ max: 10 }), note: field.text() } } },
    rules: { lines: { each: { price: { min: (_, { values }) => values.limit ?? undefined } } } },
  });
const dirty = (session) => {
  const { form, rows } = session.getSnapshot();
  return {
    form: form.dirty,
    lines: form.collections.lines.dirty,
    rows: rows.lines.map((key) => session.row("lines", key).getSnapshot().dirty),
  };
};

test("a row is dirty if it is new or a value changed, and a collection is also dirty if its order or membership changed", () => {
  const session = createSession(order(), { initial: { lines: [{ price: 1 }, { price: 2 }] } });
  const [first, second] = session.getSnapshot().rows.lines;
  assert.deepEqual(dirty(session), { form: false, lines: false, rows: [false, false] });
  session.row("lines", first).edit("price", 3);
  assert.deepEqual(dirty(session), { form: true, lines: true, rows: [true, false] });
  session.row("lines", first).edit("price", 1);
  assert.deepEqual(dirty(session), { form: false, lines: false, rows: [false, false] });
  session.move("lines", second, 0);
  assert.deepEqual(dirty(session), { form: true, lines: true, rows: [false, false] });
  session.move("lines", second, 1);
  assert.deepEqual(dirty(session), { form: false, lines: false, rows: [false, false] });
  const [added] = session.add("lines", [{ price: 1 }]);
  assert.deepEqual(dirty(session), { form: true, lines: true, rows: [false, false, true] });
  session.remove("lines", [added]);
  assert.deepEqual(dirty(session), { form: false, lines: false, rows: [false, false] });
  session.remove("lines", [second]);
  assert.deepEqual(dirty(session), { form: true, lines: true, rows: [false] });
  session.reset();
  assert.deepEqual(dirty(session), { form: false, lines: false, rows: [false, false] });
});

test("a header change makes the form dirty without making the collection dirty", () => {
  const session = createSession(order(), { initial: { lines: [{}] } });
  session.edit("note", "x");
  assert.deepEqual(dirty(session), { form: true, lines: false, rows: [false] });
});

test("a rejected operation leaves dirty state and counts unchanged", () => {
  const session = createSession(order(), { initial: { lines: [{ price: 5 }] } });
  const [key] = session.getSnapshot().rows.lines;
  session.edit("note", "x");
  session.edit("note", "");
  const before = session.getSnapshot().form;
  rejects(
    session,
    () => session.patch({ note: "y", limit: 20 }),
    `Field "price" of "lines" row "${key}" (number): min 20 exceeds max 10`,
  );
  assert.equal(session.getSnapshot().form, before);
  assert.equal(before.dirty, false);
  session.edit("note", "z");
  assert.equal(session.getSnapshot().form.dirty, true);
  session.edit("note", "");
  assert.equal(session.getSnapshot().form.dirty, false);
});

test("a new row is dirty even if it has no fields", () => {
  const session = createSession(
    defineForm({ fields: {}, collections: { marks: { fields: {} } } }),
    { initial: { marks: [{}] } },
  );
  const [saved] = session.getSnapshot().rows.marks;
  const [added] = session.add("marks", [{}]);
  assert.equal(session.row("marks", saved).getSnapshot().dirty, false);
  assert.equal(session.row("marks", added).getSnapshot().dirty, true);
});

test("reset releases the states of the rows it replaced, even when it restores the same number of rows", async () => {
  setFlagsFromString("--expose-gc");
  const collect = runInNewContext("gc");
  const session = createSession(
    defineForm({
      fields: {},
      collections: { lines: { fields: { note: field.text() } } },
      rules: { lines: { each: { note: { error: ({ note }) => note.startsWith("z") && note } } } },
    }),
    { initial: { lines: [{}] } },
  );
  const [opened] = session.getSnapshot().rows.lines;
  // The added row has states of its own: no other row shares them.
  session.remove("lines", [opened]);
  session.add("lines", [{ note: "z-temporary" }]);
  const states = new WeakRef(session.getSnapshot().fieldStates.lines[0]);
  session.reset();
  assert.equal(session.getSnapshot().rows.lines.length, 1);
  // A collection between tasks, a few times, until the states are released.
  const released = async (rounds) => {
    if (states.deref() === undefined || rounds === 0) return states.deref() === undefined;
    await nextTask();
    collect();
    return released(rounds - 1);
  };
  assert.ok(await released(8));
});
