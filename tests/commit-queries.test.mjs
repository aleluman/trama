import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

// After a commit, reset brings back the confirmed values: a query does not ask
// again for what arrived, in the header or in a row, nor for what the server
// wrote; it asks again for what had not arrived when preparing.

test("after commit, reset does not query committed values; before commit, it queries values omitted from initial", async () => {
  const quotes = defineEndpoints({
    rate: endpoint.value((_, { day }) => Promise.resolve(day * 100)),
  });
  const { defineForm: bound, field: kind } = createForms({ endpoints: [quotes] });
  const form = bound({
    fields: { day: kind.number({ default: 1 }), rate: kind.number() },
    rules: { rate: { query: { endpoint: "rate", params: ({ day }) => ({ day }) } } },
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(form, { scope: "acme", loader });
  assert.equal(calls.length, 1);
  await calls[0].resolve();
  session.reset();
  assert.equal(calls.length, 2);
  await calls[1].resolve();
  const sent = await session.prepare();
  session.commit(sent);
  session.reset();
  assert.equal(calls.length, 2);
  assert.equal(session.getSnapshot().queries.rate.status, "idle");
  assert.equal(session.getSnapshot().values.rate, 100);
  // Its params stay as the last requested: another day asks again.
  session.edit("day", 2);
  assert.equal(calls.length, 3);
});

// A form whose note a query asks for, given the day.
const noteForm = () => {
  const notes = defineEndpoints({ note: endpoint.value(() => Promise.resolve("Suggested")) });
  const { defineForm: bound, field: kind } = createForms({ endpoints: [notes] });
  return bound({
    fields: { day: kind.number({ default: 1 }), note: kind.text(), other: kind.text() },
    rules: { note: { query: { endpoint: "note", params: ({ day }) => ({ day }) } } },
  });
};
const askedAgain = (session, calls) => {
  session.edit("other", "x");
  const before = calls.length;
  session.reset();
  return calls.length - before;
};

for (const [name, settleIt] of [
  ["still in flight", () => {}],
  ["that failed", (calls) => calls[0].reject(new Error("offline"))],
])
  test(`after commit, reset requests values that had not arrived at prepare time again for a query ${name}`, async () => {
    const { loader, calls } = scriptedLoader();
    const session = createSession(noteForm(), { scope: "acme", loader });
    await settleIt(calls);
    assert.equal(session.commit(await session.prepare()), true);
    assert.equal(askedAgain(session, calls), 1);
    assert.equal(session.getSnapshot().queries.note.status, "pending");
  });

test("after commit, reset does not request values that had not arrived if the server wrote them", async () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(noteForm(), { scope: "acme", loader });
  assert.equal(session.commit(await session.prepare(), { note: "From the server" }), true);
  assert.equal(askedAgain(session, calls), 0);
  assert.equal(session.getSnapshot().values.note, "From the server");
});

test("after commit, reset does not query committed row values either", async () => {
  const prices = defineEndpoints({
    price: endpoint.value((_, { product }) => Promise.resolve(product * 10)),
  });
  const { defineForm: bound, field: kind } = createForms({ endpoints: [prices] });
  const form = bound({
    fields: {},
    collections: { lines: { fields: { product: kind.number(), price: kind.number() } } },
    rules: {
      lines: {
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
  const { loader, calls } = scriptedLoader();
  const session = createSession(form, { scope: "acme", loader });
  session.add("lines", [{ product: 2 }]);
  await calls[0].resolve();
  session.commit(await session.prepare());
  session.reset();
  assert.equal(calls.length, 1);
  assert.equal(session.getSnapshot().values.lines[0].price, 20);
});
