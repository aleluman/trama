import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

// What fails in a commit changes nothing: neither the baseline nor the values
// in force, and the prepared can be committed again. A rejected operation
// after preparing writes nothing, so it does not hold a canonical value.
const sale = defineForm({
  fields: {
    quantity: field.number({ default: 2 }),
    price: field.number({ default: 10 }),
    amount: field.number(),
    floor: field.number(),
    note: field.text(),
  },
  rules: {
    amount: {
      value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0),
      min: ({ floor }) => floor ?? undefined,
      max: ({ quantity }) => (quantity ?? 0) * 100,
    },
  },
});
const values = (session) => session.getSnapshot().values;

test("a cascade that fails only in the live state throws without changing the baseline or live state, and the prepared submission remains usable", async () => {
  const session = createSession(sale);
  const sent = await session.prepare();
  session.edit("quantity", 1);
  rejects(
    session,
    () => session.commit(sent, { floor: 150 }),
    'Field "amount" (number): min 150 exceeds max 100',
  );
  // The baseline is still the opening: back to it, nothing is dirty.
  session.edit("quantity", 2);
  assert.equal(session.getSnapshot().form.dirty, false);
  assert.equal(session.commit(sent, { floor: 150 }), true);
  assert.equal(values(session).floor, 150);
  session.edit("floor", null);
  session.reset();
  assert.equal(values(session).floor, 150);
});

test("an operation rejected after preparing writes nothing, so it does not hold back a canonical value", async () => {
  const session = createSession(sale);
  const sent = await session.prepare();
  rejects(
    session,
    () => session.patch({ note: "x", floor: 500 }),
    'Field "amount" (number): min 500 exceeds max 200',
  );
  session.commit(sent, { note: "server", price: 11 });
  assert.deepEqual(
    { note: values(session).note, amount: values(session).amount },
    { note: "server", amount: 22 },
  );
  assert.equal(session.getSnapshot().form.dirty, false);
});

test("an event revealed late that rewinds the attempt records the writer from the completed attempt", async () => {
  // check reads zone before the event of depot writes it, so the attempt goes
  // back to check; zone ends written by the event, explicitly.
  const form = defineForm({
    fields: {
      check: field.number(),
      zone: field.number(),
      depot: field.number(),
      code: field.number(),
    },
    rules: {
      check: { value: ({ zone, depot }) => (zone ?? 0) + (depot ?? 0) },
      zone: { value: ({ code }) => code },
      depot: { onChange: ({ depot }) => ({ zone: depot }) },
    },
  });
  const session = createSession(form, { initial: { zone: 1, depot: 1, code: 1 } });
  const sent = await session.prepare();
  session.edit("depot", 2);
  assert.deepEqual(values(session), { check: 4, zone: 2, depot: 2, code: 1 });
  session.commit(sent, { code: 5 });
  // zone keeps the write of the event; the formula of zone did not replace it.
  assert.deepEqual(values(session), { check: 4, zone: 2, depot: 2, code: 5 });
  session.reset();
  assert.deepEqual(values(session), { check: 6, zone: 5, depot: 1, code: 5 });
});

test("a commit that fails in the live state leaves the prepared submission's tracking intact: reads that depend on a value still work after reset", async () => {
  const form = defineForm({
    fields: {
      mode: field.checkbox(),
      a: field.number({ default: 1 }),
      b: field.number({ default: 2 }),
      chosen: field.number(),
      quantity: field.number({ default: 2 }),
      amount: field.number(),
      floor: field.number(),
      note: field.text(),
    },
    rules: {
      // It reads a or b, as mode says: destructuring would read both.
      chosen: { value: (row) => (row.mode ? row.a : row.b) },
      amount: {
        value: ({ quantity }) => (quantity ?? 0) * 10,
        min: ({ floor }) => floor ?? undefined,
        max: ({ quantity }) => (quantity ?? 0) * 100,
      },
    },
  });
  const session = createSession(form);
  const sent = await session.prepare();
  session.edit("quantity", 1);
  // The baseline resolves with mode true, which reads a; the values in force reject floor 150.
  rejects(
    session,
    () => session.commit(sent, { mode: true, floor: 150 }),
    'Field "amount" (number): min 150 exceeds max 100',
  );
  assert.equal(session.commit(sent, { note: "saved" }), true);
  session.reset();
  assert.equal(values(session).chosen, 2);
  // The prepared kept its memory: chosen still reads b.
  session.edit("b", 5);
  assert.equal(values(session).chosen, 5);
});

test("the writer of a step undone by the attempt is not recorded", async () => {
  // A patch writes x, y and t. The formula of x writes it while y differs; the
  // event of t, revealed late, writes y back, so the attempt goes back and x
  // keeps the value the command wrote, explicitly.
  const form = defineForm({
    fields: { y: field.number({ default: 1 }), x: field.number(), t: field.number() },
    rules: {
      x: { value: ({ y }) => (y ?? 0) * 10 },
      t: { onChange: () => ({ y: 1 }) },
    },
  });
  const session = createSession(form);
  const sent = await session.prepare();
  session.patch({ x: 5, y: 2, t: 1 });
  assert.deepEqual(values(session), { y: 1, x: 5, t: 1 });
  session.commit(sent, { y: 3 });
  // x is still the explicit write after preparing: the cascade of y keeps it.
  assert.deepEqual(values(session), { y: 3, x: 5, t: 1 });
});

test("a prepared submission retains its tracking: a formula whose reads later change resolves the baseline with the reads from prepare time", async () => {
  const form = defineForm({
    fields: {
      mode: field.checkbox(),
      a: field.number({ default: 1 }),
      b: field.number({ default: 2 }),
      chosen: field.number(),
    },
    rules: { chosen: { value: (row) => (row.mode ? row.a : row.b) } },
  });
  const session = createSession(form);
  // The memory stops being shared with the opening.
  session.edit("mode", true);
  session.edit("mode", false);
  const sent = await session.prepare();
  // In force, chosen reads a; in the prepared, b.
  session.edit("mode", true);
  session.commit(sent, { b: 7 });
  session.reset();
  assert.deepEqual(values(session), { mode: false, a: 1, b: 7, chosen: 7 });
});
