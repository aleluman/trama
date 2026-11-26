import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs, rejects } from "./helpers/session.mjs";

// commit: the baseline becomes the prepared with the canonical values, and the
// values in force keep what changed after preparing, also in a cascade.
const sale = defineForm({
  fields: {
    number: field.number(),
    quantity: field.number({ default: 2 }),
    price: field.number({ default: 10 }),
    amount: field.number(),
    code: field.text(),
    label: field.text(),
    floor: field.number(),
    note: field.text(),
  },
  rules: {
    amount: {
      value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0),
      min: ({ floor }) => floor ?? undefined,
      max: () => 1000,
    },
    label: { value: ({ number }) => (number === null ? "" : `#${number}`) },
    code: { onChange: ({ code }) => ({ label: code.toUpperCase() }) },
  },
  outputs: ({ output }) => ({ doubled: output(({ amount }) => (amount ?? 0) * 2) }),
});
const values = (session, ...names) =>
  Object.fromEntries(names.map((name) => [name, session.getSnapshot().values[name]]));
const dirty = (session, ...names) =>
  Object.fromEntries(names.map((name) => [name, session.getSnapshot().fieldStates[name].dirty]));

test("commit sets the prepared submission as the baseline: it clears dirty for submitted values, and reset restores the committed values", async () => {
  const session = createSession(sale, { initial: { note: "open" } });
  session.edit("note", "submitted");
  const sent = await session.prepare();
  assert.equal(session.getSnapshot().form.dirty, true);
  let heard = 0;
  session.subscribe(() => heard++);
  const before = session.getSnapshot();
  assert.equal(session.commit(sent), true);
  assert.equal(heard, 1);
  // Nothing changed after preparing: the values keep their object.
  assert.equal(session.getSnapshot().values, before.values);
  assert.equal(session.getSnapshot().form.dirty, false);
  assert.equal(session.getSnapshot().fieldStates.note.dirty, false);
  session.edit("note", "open");
  assert.equal(session.getSnapshot().fieldStates.note.dirty, true);
  session.edit("note", "other");
  session.reset();
  assert.deepEqual(values(session, "note"), { note: "submitted" });
  assert.equal(session.getSnapshot().form.dirty, false);
});

test("canonical values go to the baseline and reach the live state only where nothing changed after preparing, even if a value changed back", async () => {
  const session = createSession(sale, { initial: { code: "a", note: "n" } });
  const sent = await session.prepare();
  session.edit("note", "other");
  session.edit("note", "n");
  assert.equal(session.commit(sent, { number: 42, note: "server" }), true);
  assert.deepEqual(values(session, "number", "label", "note"), {
    number: 42,
    label: "#42",
    note: "n",
  });
  assert.deepEqual(dirty(session, "number", "label", "note"), {
    number: false,
    label: false,
    note: true,
  });
  session.reset();
  assert.deepEqual(values(session, "number", "label", "note"), {
    number: 42,
    label: "#42",
    note: "server",
  });
});

test("the amount edited to 99 after prepare keeps its value through the commit cascade", async () => {
  const session = createSession(sale);
  const sent = await session.prepare();
  assert.equal(sent.values.amount, 20);
  session.edit("amount", 99);
  session.commit(sent, { price: 11 });
  assert.deepEqual(values(session, "quantity", "price", "amount"), {
    quantity: 2,
    price: 11,
    amount: 99,
  });
  assert.deepEqual(dirty(session, "price", "amount"), { price: false, amount: true });
  assert.equal(currentOutputs(session).doubled, 198);
  session.reset();
  assert.deepEqual(values(session, "price", "amount"), { price: 11, amount: 22 });
});

for (const [name, edits] of [
  ["with the live quantity at 3", (session) => session.edit("quantity", 3)],
  [
    "even if a formula replaced the direct edit",
    (session) => {
      session.edit("amount", 99);
      session.edit("quantity", 3);
    },
  ],
  [
    "even if a formula repeated the directly edited amount",
    (session) => {
      session.edit("amount", 30);
      session.edit("quantity", 3);
    },
  ],
])
  test(`formulas keep deriving: the amount is 33 ${name}`, async () => {
    const session = createSession(sale);
    const sent = await session.prepare();
    edits(session);
    assert.equal(values(session, "amount").amount, 30);
    let heard = 0;
    session.subscribe(() => heard++);
    assert.equal(session.commit(sent, { price: 11 }), true);
    assert.equal(heard, 1);
    assert.deepEqual(values(session, "quantity", "price", "amount"), {
      quantity: 3,
      price: 11,
      amount: 33,
    });
    assert.deepEqual(dirty(session, "quantity", "amount"), { quantity: true, amount: true });
    assert.equal(currentOutputs(session).doubled, 66);
    session.reset();
    assert.deepEqual(values(session, "quantity", "price", "amount"), {
      quantity: 2,
      price: 11,
      amount: 22,
    });
    assert.equal(session.getSnapshot().form.dirty, false);
  });

test("a formula that repeats an unedited amount does not keep its canonical value from arriving", async () => {
  const session = createSession(sale);
  const sent = await session.prepare();
  session.patch({ quantity: 4, price: 5 });
  assert.equal(values(session, "amount").amount, 20);

  assert.equal(session.commit(sent, { amount: 77 }), true);
  assert.equal(values(session, "amount").amount, 77);
});

const guardedSale = defineForm({
  fields: {
    quantity: field.number({ default: 2 }),
    price: field.number({ default: 10 }),
    amount: field.number(),
  },
  rules: {
    amount: {
      value: ({ quantity, price }) =>
        quantity === 3 && price === 10 ? undefined : quantity * price,
    },
    quantity: { onChange: ({ quantity }) => (quantity === 4 ? { amount: 30 } : undefined) },
  },
});

for (const [reason, quantity] of [
  ["returns undefined", 3],
  ["yields to an event that repeats the amount", 4],
])
  test(`the edited amount is preserved at commit if its formula ${reason}`, async () => {
    const session = createSession(guardedSale);
    const sent = await session.prepare();
    session.edit("amount", 30);
    session.edit("quantity", quantity);
    assert.equal(values(session, "amount").amount, 30);

    assert.equal(session.commit(sent, { price: 11 }), true);
    assert.deepEqual(values(session, "price", "amount"), { price: 11, amount: 30 });
  });

test("an event write after preparing is preserved; a write before preparing derives as it does in the baseline", async () => {
  const later = createSession(sale, { initial: { code: "a" } });
  const sent = await later.prepare();
  later.edit("code", "b");
  assert.equal(values(later, "label").label, "B");
  later.commit(sent, { number: 5 });
  assert.deepEqual(values(later, "number", "label"), { number: 5, label: "B" });
  assert.deepEqual(dirty(later, "code", "label"), { code: true, label: true });

  const earlier = createSession(sale, { initial: { code: "a" } });
  earlier.edit("code", "b");
  const before = await earlier.prepare();
  earlier.commit(before, { number: 5 });
  assert.deepEqual(values(earlier, "number", "label"), { number: 5, label: "#5" });
  assert.equal(earlier.getSnapshot().form.dirty, false);
});

test("commit returns false without publishing for a prepared submission from before a reset, one no newer than the last accepted, or one already accepted", async () => {
  const session = createSession(sale);
  const first = await session.prepare();
  const second = await session.prepare();
  assert.equal(session.commit(second, { number: 2 }), true);
  let heard = 0;
  session.subscribe(() => heard++);
  const before = session.getSnapshot();
  assert.equal(session.commit(first, { number: 1 }), false);
  assert.equal(session.commit(second, { number: 3 }), false);
  assert.equal(heard, 0);
  assert.equal(session.getSnapshot(), before);
  const third = await session.prepare();
  session.reset();
  assert.equal(session.commit(third), false);
  assert.equal(values(session, "number").number, 2);
});

test("commit throws for a prepared submission from another session or a fabricated one, and does not run while the session is notifying", async () => {
  const session = createSession(sale);
  const other = await createSession(sale).prepare();
  const own = await session.prepare();
  const message = "commit: prepared belongs to another session";
  rejects(session, () => session.commit(other), message);
  rejects(session, () => session.commit({ ...own }), message);
  for (const fake of [undefined, null, 5, "ready"])
    rejects(session, () => session.commit(fake), message);
  let failure;
  const stop = session.subscribe(() => {
    try {
      session.commit(own);
    } catch (error) {
      failure = error;
    }
  });
  session.edit("note", "x");
  stop();
  assert.equal(failure?.message, "Cannot commit a session during its notification");
  assert.equal(session.commit(own), true);
});

test("an invalid patch or failing cascade throws without changing anything or consuming the prepared submission", async () => {
  const session = createSession(sale);
  const sent = await session.prepare();
  session.edit("note", "later");
  rejects(session, () => session.commit(sent, 5), "commit: expected a patch object, got 5");
  rejects(
    session,
    () => session.commit(sent, { nmber: 1 }),
    'commit: unknown field "nmber" in patch',
  );
  rejects(
    session,
    () => session.commit(sent, { number: "1" }),
    'commit: incompatible value "1" for number field "number"',
  );
  rejects(
    session,
    () => session.commit(sent, { floor: 2000 }),
    'Field "amount" (number): min 2000 exceeds max 1000',
  );
  assert.equal(session.commit(sent, { number: 1 }), true);
  assert.deepEqual(values(session, "number", "note"), { number: 1, note: "later" });
});

test("commit preserves the attempt, and reset clears it", async () => {
  const session = createSession(sale);
  const sent = await session.prepare();
  session.commit(sent);
  assert.equal(session.getSnapshot().form.attempted, true);
  session.reset();
  assert.equal(session.getSnapshot().form.attempted, false);
});

test("a commit write does not count as a change for another prepared submission: the newer canonical value reaches the live state", async () => {
  const session = createSession(sale, { initial: { code: "a" } });
  const first = await session.prepare();
  const second = await session.prepare();
  session.commit(first, { code: "A-1", price: 12 });
  assert.deepEqual(values(session, "code", "price", "amount"), {
    code: "A-1",
    price: 12,
    amount: 24,
  });
  session.commit(second, { code: "A-2", price: 13 });
  assert.deepEqual(values(session, "code", "price", "amount"), {
    code: "A-2",
    price: 13,
    amount: 26,
  });
  assert.equal(session.getSnapshot().form.dirty, false);
});
