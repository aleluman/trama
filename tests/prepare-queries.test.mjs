import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader, settle } from "./helpers/scripted-loader.mjs";

// prepare waits only for the queries forPrepare, of the header, of rows and of
// rule sets, and for the close of their batch. Sessions ask through the
// scripted loader, a mock: each request waits until the test settles it, and
// resolve() runs the endpoint's load as the direct loader does.
const scope = "acme";
const server = defineEndpoints({
  rate: endpoint.value((_, { date }) => Promise.resolve(date === "2026-11-02" ? 150 : 144)),
  fee: endpoint.value((_, { rate }) => Promise.resolve(rate / 100)),
  note: endpoint.value(() => Promise.resolve("Suggested")),
  price: endpoint.value((_, { product }) => Promise.resolve(product * 10)),
  broken: endpoint.value(() => Promise.reject(new Error("unavailable"))),
});
const { defineForm, defineRules, field } = createForms({
  endpoints: [server],
  messages: { query: ({ label }) => `Could not retrieve ${label ?? "a value"}` },
});
const byDate = ({ date }) => (date === null ? undefined : { date });
// A report whose rate is needed, whose fee needs the rate and whose note is optional.
const report = defineForm({
  fields: {
    date: field.date(),
    rate: field.number({ label: "the rate" }),
    fee: field.number(),
    note: field.text(),
  },
  rules: {
    rate: { query: { endpoint: "rate", params: byDate, forPrepare: true } },
    fee: {
      query: {
        endpoint: "fee",
        params: ({ rate }) => (rate === null ? undefined : { rate }),
        forPrepare: true,
      },
    },
    note: { query: { endpoint: "note", params: byDate } },
  },
});
const today = { date: "2026-11-02" };
const open = (definition = report, initial = today) => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(definition, { scope, loader, initial });
  return { session, calls, pending: (name) => calls.filter(({ key }) => key[2] === name) };
};
// A prepare whose outcome the test reads once it arrives.
const watch = (promise) => {
  const seen = { outcome: undefined };
  void promise.then((outcome) => (seen.outcome = outcome));
  return seen;
};

test("prepare waits for the necessary query and its batch, and does not return ready between two chained necessary queries", async () => {
  const { session, pending } = open();
  const seen = watch(session.prepare());
  await settle();
  assert.equal(seen.outcome, undefined);
  await pending("rate")[0].resolve();
  // The rate arrived and started the fee, which the prepare needs too.
  assert.equal(seen.outcome, undefined);
  assert.equal(session.getSnapshot().queries.fee.status, "pending");
  await pending("fee")[0].resolve();
  assert.equal(seen.outcome?.status, "ready");
  assert.deepEqual(
    { rate: seen.outcome.values.rate, fee: seen.outcome.values.fee },
    { rate: 150, fee: 1.5 },
  );
  // The optional note is still pending, and did not hold it.
  assert.equal(session.getSnapshot().queries.note.status, "pending");
});

test("an optional query that does not respond does not block, and neither does a suspended or supplied necessary query", async () => {
  const optional = open(report, { date: "2026-11-02", rate: 1, fee: 2 });
  assert.equal(optional.session.getSnapshot().queries.note.status, "pending");
  assert.equal((await optional.session.prepare()).status, "ready");
  const suspended = open(report, { date: null });
  assert.equal(suspended.session.getSnapshot().queries.rate.status, "idle");
  assert.equal((await suspended.session.prepare()).status, "ready");
});

test("a failed necessary query returns invalid with messages.query on its field, and retry and the response lead to ready", async () => {
  const { session, pending } = open();
  const seen = watch(session.prepare());
  await pending("rate")[0].reject(new Error("no network"));
  assert.deepEqual(seen.outcome, {
    status: "invalid",
    issues: [{ field: "rate", message: "Could not retrieve the rate" }],
  });
  // A failure that is still there is invalid at once.
  assert.equal((await session.prepare()).status, "invalid");
  session.retry("rate");
  const again = watch(session.prepare());
  await pending("rate")[1].resolve();
  await pending("fee")[0].resolve();
  assert.equal(again.outcome?.status, "ready");
});

test("two necessary queries that respond together are applied in one batch and return ready once", async () => {
  const twin = defineForm({
    fields: { date: field.date(), rate: field.number(), other: field.number() },
    rules: {
      rate: { query: { endpoint: "rate", params: byDate, forPrepare: true } },
      other: { query: { endpoint: "rate", params: byDate, forPrepare: true } },
    },
  });
  const { session, calls } = open(twin);
  let heard = 0;
  session.subscribe(() => heard++);
  const seen = watch(session.prepare());
  heard = 0;
  const deliveries = await Promise.all(calls.map((call) => call.ready()));
  for (const deliver of deliveries) deliver();
  await settle();
  assert.equal(heard, 1);
  assert.deepEqual(seen.outcome?.values, { date: "2026-11-02", rate: 150, other: 150 });
});

test("prepare also waits for necessary queries from rows and rule sets, for each row", async () => {
  const priced = defineRules({
    collections: { lines: { fields: { product: field.number(), price: field.number() } } },
    rules: {
      lines: {
        each: {
          price: {
            query: {
              endpoint: "price",
              params: ({ product }) => (product === null ? undefined : { product }),
              forPrepare: true,
            },
          },
        },
      },
    },
  });
  const order = defineForm({
    fields: { date: field.date() },
    collections: { lines: { fields: { product: field.number(), price: field.number() } } },
    include: [priced],
  });
  const { session, pending } = open(order, { date: null, lines: [{ product: 1 }, { product: 2 }] });
  const seen = watch(session.prepare());
  await pending("price")[0].resolve();
  assert.equal(seen.outcome, undefined);
  await pending("price")[1].resolve();
  assert.equal(seen.outcome?.status, "ready");
  assert.deepEqual(
    seen.outcome.values.lines.map((line) => line.price),
    [10, 20],
  );
  // A failure in a row is a problem of its field there.
  const failing = open(order, { date: null, lines: [{ product: 3 }] });
  const [key] = failing.session.getSnapshot().rows.lines;
  const invalid = watch(failing.session.prepare());
  await failing.pending("price")[0].reject(new Error("no network"));
  assert.deepEqual(invalid.outcome?.issues, [
    { collection: "lines", key, field: "price", message: "Could not retrieve a value" },
  ]);
});

test("an application message that throws rejects the promise with its cause", async () => {
  const cause = new Error("no message");
  const { defineForm: strict, field: kind } = createForms({
    endpoints: [server],
    messages: {
      query: () => {
        throw cause;
      },
    },
  });
  const form = strict({
    fields: { date: kind.date(), rate: kind.number() },
    rules: { rate: { query: { endpoint: "broken", params: byDate, forPrepare: true } } },
  });
  const { session, pending } = open(form);
  const failure = assert.rejects(session.prepare(), (error) => {
    assert.equal(error.message, "Validation message query: formula failed: no message");
    assert.equal(error.cause, cause);
    return true;
  });
  await pending("broken")[0].resolve();
  await failure;
});

test("necessity belongs to the compiled rule, so an optional query with the same name in another collection does not block", async () => {
  const order = defineForm({
    fields: { price: field.number() },
    collections: {
      lines: { fields: { product: field.number(), price: field.number() } },
      gifts: { fields: { product: field.number(), price: field.number() } },
    },
    rules: {
      price: { query: { endpoint: "price", params: () => ({ product: 1 }) } },
      lines: {
        each: {
          price: {
            query: {
              endpoint: "price",
              params: ({ product }) => (product === null ? undefined : { product }),
              forPrepare: true,
            },
          },
        },
      },
      gifts: {
        each: {
          price: {
            query: {
              endpoint: "price",
              params: ({ product }) => (product === null ? undefined : { product }),
            },
          },
        },
      },
    },
  });
  const { session, pending } = open(order, { lines: [{}], gifts: [{ product: 4 }] });
  // The price of the header and that of the gift are pending, and optional.
  assert.equal(pending("price").length, 2);
  assert.equal((await session.prepare()).status, "ready");
});

test("a failed optional query does not invalidate, and a cell's label reaches the message for a failed necessary query", async () => {
  const optional = open(report, { date: "2026-11-02", rate: 1, fee: 2 });
  await optional.pending("note")[0].reject(new Error("no network"));
  assert.equal(optional.session.getSnapshot().queries.note.status, "error");
  assert.equal((await optional.session.prepare()).status, "ready");
  const labeled = defineForm({
    fields: {},
    collections: {
      lines: { fields: { product: field.number(), price: field.number({ label: "the price" }) } },
    },
    rules: {
      lines: {
        each: {
          price: {
            query: {
              endpoint: "price",
              params: ({ product }) => (product === null ? undefined : { product }),
              forPrepare: true,
            },
          },
        },
      },
    },
  });
  const { session, pending } = open(labeled, { lines: [{ product: 1 }] });
  const [key] = session.getSnapshot().rows.lines;
  await pending("price")[0].reject(new Error("no network"));
  assert.deepEqual((await session.prepare()).issues, [
    { collection: "lines", key, field: "price", message: "Could not retrieve the price" },
  ]);
});
