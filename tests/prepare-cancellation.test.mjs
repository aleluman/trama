import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader, settle } from "./helpers/scripted-loader.mjs";

// What cancels a prepare that waits: an operation of the application that
// changes values or rows, a reset, the signal and another prepare. An
// operation without effect, a response and a commit do not, and cancelling
// stops no query. The scripted loader is a mock whose requests wait until the
// test settles them.
const scope = "acme";
const server = defineEndpoints({
  rate: endpoint.value((_, { date }) => Promise.resolve(date === "2026-11-02" ? 150 : 144)),
});
const { defineForm, field } = createForms({ endpoints: [server] });
const voucher = defineForm({
  fields: { date: field.date(), rate: field.number(), number: field.number(), note: field.text() },
  collections: { lines: { fields: { amount: field.number() } } },
  rules: {
    rate: {
      query: {
        endpoint: "rate",
        params: ({ date }) => (date === null ? undefined : { date }),
        forPrepare: true,
      },
    },
  },
});
const saved = { date: "2026-11-02", lines: [{ amount: 1 }, { amount: 2 }] };
const open = (initial = saved) => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(voucher, { scope, loader, initial });
  return { session, calls };
};
const watch = (promise) => {
  const seen = { outcome: undefined };
  void promise.then((outcome) => (seen.outcome = outcome));
  return seen;
};
const cancelled = { status: "cancelled" };
const firstRow = (session) => session.getSnapshot().rows.lines[0];

for (const [name, operate] of [
  ["edit", (session) => session.edit("note", "Another")],
  ["patch", (session) => session.patch({ note: "Another" })],
  ["add", (session) => session.add("lines", [{}])],
  ["remove", (session) => session.remove("lines", [firstRow(session)])],
  ["move", (session) => session.move("lines", firstRow(session), 1)],
  [
    "an edit through a handle",
    (session) => session.row("lines", firstRow(session)).edit("amount", 5),
  ],
])
  test(`${name} cancels prepare only when it changes values or rows, and queries keep running`, async () => {
    const { session, calls } = open();
    const seen = watch(session.prepare());
    session.edit("note", "");
    session.patch({ note: "" });
    session.add("lines", []);
    session.row("lines", firstRow(session)).edit("amount", 1);
    await settle();
    assert.equal(seen.outcome, undefined);
    operate(session);
    await settle();
    assert.deepEqual(seen.outcome, cancelled);
    assert.equal(session.getSnapshot().queries.rate.status, "pending");
    assert.equal(calls[0].signal.aborted, false);
  });

test("a failed reset does not cancel a pending prepare", async () => {
  let failing = false;
  const fragile = defineForm({
    fields: { date: field.date(), rate: field.number(), note: field.text() },
    rules: {
      rate: {
        query: {
          endpoint: "rate",
          params: ({ date }) => (date === null ? undefined : { date }),
          forPrepare: true,
        },
      },
      note: {
        disabled: () => {
          if (failing) throw new Error("boom");
          return false;
        },
      },
    },
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(fragile, { scope, loader, initial: { date: "2026-11-02" } });
  // The reset has to restore the note, which runs its rule again.
  session.edit("note", "Another");
  const waiting = watch(session.prepare());
  failing = true;
  assert.throws(() => session.reset(), /boom/u);
  failing = false;
  await settle();
  assert.equal(waiting.outcome, undefined);
  await calls[0].resolve();
  await settle();
  assert.equal(waiting.outcome?.status, "ready");
  assert.equal(session.getSnapshot().form.attempted, true);
});

test("reset, the signal, and another prepare cancel, and an already aborted signal also cancels after marking the attempt", async () => {
  const reset = open();
  const first = watch(reset.session.prepare());
  reset.session.reset();
  await settle();
  assert.deepEqual(first.outcome, cancelled);
  assert.equal(reset.session.getSnapshot().form.attempted, false);

  const signalled = open();
  const controller = new AbortController();
  const aborted = watch(signalled.session.prepare({ signal: controller.signal }));
  controller.abort();
  await settle();
  assert.deepEqual(aborted.outcome, cancelled);
  assert.equal(signalled.session.getSnapshot().form.attempted, true);
  const already = await signalled.session.prepare({ signal: AbortSignal.abort() });
  assert.deepEqual(already, cancelled);

  const twice = open();
  const earlier = watch(twice.session.prepare());
  const later = watch(twice.session.prepare());
  await settle();
  assert.deepEqual(earlier.outcome, cancelled);
  assert.equal(later.outcome, undefined);
  await twice.calls[0].resolve();
  assert.equal(later.outcome?.status, "ready");
  assert.equal(later.outcome.values.rate, 150);
});

// Counts the listeners a signal holds.
const counted = (signal) => {
  let listeners = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (...args) => {
    listeners++;
    add(...args);
  };
  signal.removeEventListener = (...args) => {
    listeners--;
    remove(...args);
  };
  return () => listeners;
};
for (const [name, finish] of [
  ["ready", ({ calls }) => calls[0].resolve()],
  ["canceled by an edit", ({ session }) => session.edit("note", "Another")],
  ["canceled by another prepare", ({ session }) => void session.prepare()],
])
  test(`prepare removes its listener from the signal when it is ${name}`, async () => {
    const opened = open();
    const { signal } = new AbortController();
    const listening = counted(signal);
    const seen = watch(opened.session.prepare({ signal }));
    assert.equal(listening(), 1);
    await finish(opened);
    await settle();
    assert.notEqual(seen.outcome, undefined);
    assert.equal(listening(), 0);
  });

test("query responses and commit do not cancel, and a pending prepare captures the canonical values", async () => {
  const { session, calls } = open({ date: "2026-11-02", rate: 144, lines: [] });
  const sent = await session.prepare();
  assert.equal(sent.status, "ready");
  session.edit("date", "2026-11-03");
  const seen = watch(session.prepare());
  assert.equal(session.commit(sent, { number: 7 }), true);
  await settle();
  assert.equal(seen.outcome, undefined);
  await calls[0].resolve();
  assert.equal(seen.outcome?.status, "ready");
  assert.deepEqual(
    { number: seen.outcome.values.number, rate: seen.outcome.values.rate },
    { number: 7, rate: 144 },
  );
});
