import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { createSession } from "trama-forms/core";
import { order } from "../docs/site/examples/complete/order.ts";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

// The price of the guide's order comes from its unitPrice endpoint, whose
// simulated server answers 1000 + 100 × customer after a wait. Sessions ask
// through the scripted loader, a mock: each request waits until the test
// resolves it, and resolve() runs the endpoint's load against that server.
const scope = "demo";
const context = { mode: "edit", today: "2026-09-27", currency: { code: "JPY", taxRate: 0.2 } };
// A customer as the endpoint of the example gives it, with its metadata.
const acme = {
  value: 7,
  label: "Acme Trading",
  defaultContact: { value: 70, label: "Ana", email: "ana@acme.example" },
  deliveryHint: "Deliver to the warehouse",
};
const acmePrice = ["trama", scope, "unitPrice", { customer: 7 }];
// The requests for the price of acme, in order.
const pricesOf = (calls) => calls.filter(({ key }) => isDeepStrictEqual(key, acmePrice));
const read = (session) => {
  const { values, queries } = session.getSnapshot();
  return [values.price, values.total, queries.price.status];
};

test("a saved order keeps its price without querying, including on reset, and a new order queries only after choosing a customer and updates the total from the response", async () => {
  const { loader, calls } = scriptedLoader();
  const saved = createSession(order, {
    scope,
    context,
    loader,
    initial: { customer: acme, quantity: 4, price: 2500 },
  });
  assert.deepEqual(read(saved), [2500, 10000, "idle"]);
  saved.edit("note", "Another note");
  saved.reset();
  assert.deepEqual([read(saved), calls.length], [[2500, 10000, "idle"], 0]);
  const created = createSession(order, { scope, context: { ...context, mode: "create" }, loader });
  assert.deepEqual([read(created), calls.length], [[5000, 10000, "idle"], 0]);
  created.edit("customer", acme);
  const asked = pricesOf(calls);
  assert.equal(asked.length, 1);
  assert.deepEqual(read(created), [5000, 10000, "pending"]);
  await asked[0].resolve();
  assert.deepEqual(read(created), [1700, 3400, "idle"]);
  created.watchOutputs(({ caption }) => assert.equal(caption, "Total: 4080 JPY"))();
});

test("editing the price with the response in flight discards it, and reset queries again as on opening", async () => {
  const { loader, calls } = scriptedLoader();
  // Without a saved price, opening asks for the price of its customer.
  const session = createSession(order, { scope, context, loader, initial: { customer: acme } });
  const [opening] = pricesOf(calls);
  assert.deepEqual(read(session), [5000, 10000, "pending"]);
  session.edit("price", 4500);
  assert.deepEqual([read(session), opening.signal.aborted], [[4500, 9000, "idle"], true]);
  await opening.resolve();
  assert.deepEqual(read(session), [4500, 9000, "idle"]);
  session.reset();
  const [, again] = pricesOf(calls);
  assert.deepEqual([read(session), again.signal.aborted], [[5000, 10000, "pending"], false]);
  await again.resolve();
  assert.deepEqual(read(session), [1700, 3400, "idle"]);
});
