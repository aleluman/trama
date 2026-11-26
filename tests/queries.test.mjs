import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import {
  createForms,
  createSession,
  declareContext,
  defineEndpoints,
  endpoint,
} from "trama-forms/core";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

// These value query cases isolate revisions and generations and check the
// order in which an operation stops and starts requests. The scripted loader
// is a mock. Each request waits until the test settles it, and resolve()
// runs the endpoint's load as the direct loader does.
const scope = "acme";
// What the simulated server answers for a customer: its price, or a quote with
// the price, a discount and the currency.
const priceOf = (customer) => 1000 + 100 * customer;
const quoteOf = (customer) => ({ price: priceOf(customer), discount: 5, code: "JPY" });
const byCustomer = ({ customer }) => (customer === null ? undefined : { customer });
const keyOf = (name, customer) => ["trama", scope, name, { customer }];

// A form whose price is asked for by customer; rules may replace any entry, and
// the rest of the configuration goes to defineForm.
const setup = ({ rules, ...form } = {}) => {
  const catalog = defineEndpoints({
    unitPrice: endpoint.value((_, { customer }) => Promise.resolve(priceOf(customer))),
    quote: endpoint.value((_, { customer }) => Promise.resolve(quoteOf(customer))),
  });
  const { defineForm, field } = createForms({ endpoints: [catalog] });
  const definition = defineForm({
    ...form,
    fields: {
      customer: field.number(),
      price: field.number({ default: 5000 }),
      discount: field.number(),
      code: field.text(),
      quantity: field.number({ default: 2 }),
      total: field.number(),
      note: field.text(),
    },
    rules: {
      price: { query: { endpoint: "unitPrice", params: byCustomer } },
      total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
      ...rules,
    },
  });
  const { loader, calls } = scriptedLoader();
  const open = (initial, context) => createSession(definition, { scope, loader, initial, context });
  // The requests with the key of a customer, in the order they were made.
  const requests = (customer, name = "unitPrice") =>
    calls.filter(({ key }) => isDeepStrictEqual(key, keyOf(name, customer)));
  return { open, calls, requests };
};
const read = (session, ...names) => names.map((name) => session.getSnapshot().values[name]);
const statusOf = (session) => session.getSnapshot().queries.price.status;

test("A saved record keeps its price without querying on opening or reset, and its params remain the last requested", () => {
  const { open, calls } = setup();
  // Supplied is an own key of initial, whatever its value: also null or the default.
  for (const price of [900, null, 5000]) {
    const saved = open({ customer: 1, price });
    assert.deepEqual(read(saved, "price"), [price]);
    assert.deepEqual(saved.getSnapshot().queries, { price: { status: "idle", error: undefined } });
    // Edits that keep the params do not ask either.
    saved.edit("note", "Other");
    saved.edit("quantity", 3);
    saved.reset();
    assert.equal(statusOf(saved), "idle");
  }
  assert.equal(calls.length, 0);
  const saved = open({ customer: 1, price: 900 });
  saved.edit("customer", 2);
  assert.deepEqual(
    calls.map(({ key }) => key),
    [keyOf("unitPrice", 2)],
  );
  assert.equal(statusOf(saved), "pending");
});

test("With no price in initial, the session queries on creation even if the price comes from its default or defaults", async () => {
  const plain = setup();
  const fresh = plain.open({ customer: 1 });
  assert.equal(statusOf(fresh), "pending");
  assert.deepEqual(
    plain.calls.map(({ key }) => key),
    [keyOf("unitPrice", 1)],
  );
  await plain.calls[0].resolve();
  assert.deepEqual([...read(fresh, "price", "total"), statusOf(fresh)], [1100, 2200, "idle"]);
  const withDefaults = setup({ context: declareContext(), defaults: () => ({ price: 700 }) });
  const session = withDefaults.open({ customer: 2 }, {});
  assert.deepEqual([...read(session, "price"), statusOf(session)], [700, "pending"]);
  await withDefaults.requests(2)[0].resolve();
  assert.deepEqual(read(session, "price"), [1200]);
});

test("A late price does not overwrite a manual edit made while the query was in flight, even if the edit restores the previous value", async () => {
  const { open, requests } = setup();
  const edited = open({ customer: 1 });
  edited.edit("price", 777);
  const returned = open({ customer: 2 });
  returned.edit("price", 777);
  returned.edit("price", 5000);
  await requests(1)[0].resolve();
  await requests(2)[0].resolve();
  assert.deepEqual([...read(edited, "price", "total"), statusOf(edited)], [777, 1554, "idle"]);
  assert.deepEqual(
    [...read(returned, "price", "total"), statusOf(returned)],
    [5000, 10000, "idle"],
  );
});

// The quote writes three destinations: the price of the entry, the discount and
// the currency. Neither the entry nor the params read the discount.
const quoted = {
  price: {
    query: {
      endpoint: "quote",
      params: byCustomer,
      patch: ({ price, discount, code }) => ({ price, discount, code }),
    },
  },
};

test("Revisions discard the entire response when only the discount is edited, even if its value is restored. The discount is a patch destination outside the entry and params reads", async () => {
  const { open, requests } = setup({ rules: quoted });
  const untouched = open({ customer: 1 });
  const edited = open({ customer: 2 });
  edited.edit("discount", 10);
  const returned = open({ customer: 3 });
  returned.edit("discount", 10);
  returned.edit("discount", null);
  // The generation of both is still current: the entry and the params did not change.
  assert.deepEqual([statusOf(edited), statusOf(returned)], ["pending", "pending"]);
  const [[first], [second], [third]] = [1, 2, 3].map((customer) => requests(customer, "quote"));
  assert.deepEqual([second.signal.aborted, third.signal.aborted], [false, false]);
  await first.resolve();
  await second.resolve();
  await third.resolve();
  // Without edits, the same answer writes its three destinations.
  assert.deepEqual(read(untouched, "price", "discount", "code"), [1100, 5, "JPY"]);
  assert.deepEqual(
    [...read(edited, "price", "discount", "code"), statusOf(edited)],
    [5000, 10, "", "idle"],
  );
  assert.deepEqual(
    [...read(returned, "price", "discount", "code"), statusOf(returned)],
    [5000, null, "", "idle"],
  );
});

test("When responses arrive out of order and A arrives after B, B remains", async () => {
  const { open, requests } = setup();
  const session = open();
  session.edit("customer", 1);
  session.edit("customer", 2);
  const [[a], [b]] = [requests(1), requests(2)];
  assert.deepEqual([a.signal.aborted, b.signal.aborted], [true, false]);
  await b.resolve();
  assert.deepEqual([...read(session, "price", "total"), statusOf(session)], [1200, 2400, "idle"]);
  const before = session.getSnapshot();
  await a.resolve();
  assert.equal(session.getSnapshot(), before);
});

test("When the response from generation A arrives before B, it does not run its patch, write, or change B's pending state", async () => {
  const patched = [];
  const count = (price) => {
    patched.push(price);
    return { price };
  };
  const { open, requests } = setup({
    rules: { price: { query: { endpoint: "unitPrice", params: byCustomer, patch: count } } },
  });
  const session = open();
  let notifications = 0;
  session.subscribe(() => notifications++);
  session.edit("customer", 1);
  session.edit("customer", 2);
  // Only the params changed: no event writes the price, which keeps its revision.
  assert.deepEqual([...read(session, "price"), statusOf(session)], [5000, "pending"]);
  const before = session.getSnapshot();
  await requests(1)[0].resolve();
  assert.deepEqual(patched, []);
  assert.equal(session.getSnapshot(), before);
  assert.equal(notifications, 2);
  await requests(2)[0].resolve();
  assert.deepEqual(patched, [1200]);
  assert.deepEqual([...read(session, "price", "total"), statusOf(session)], [1200, 2400, "idle"]);
});

test("Switching from A to empty invalidates A without querying, and its response does not write", async () => {
  const { open, calls } = setup();
  const session = open({ customer: 1 });
  const [a] = calls;
  session.edit("customer", null);
  assert.deepEqual([statusOf(session), a.signal.aborted, calls.length], ["idle", true, 1]);
  const before = session.getSnapshot();
  await a.resolve();
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(read(session, "price"), [5000]);
});

test("reset invalidates the query and reruns it as on opening, including with the same params and after a response", async () => {
  const { open, requests } = setup();
  const session = open({ customer: 1 });
  session.edit("customer", 2);
  const [second] = requests(2);
  session.reset();
  assert.equal(second.signal.aborted, true);
  assert.equal(requests(1).length, 2);
  assert.deepEqual(
    [...read(session, "customer", "price"), statusOf(session)],
    [1, 5000, "pending"],
  );
  await second.resolve();
  assert.deepEqual([...read(session, "price"), statusOf(session)], [5000, "pending"]);
  await requests(1)[1].resolve();
  assert.deepEqual([...read(session, "price"), statusOf(session)], [1100, "idle"]);
  // After an answer, reset restores the baseline and asks again.
  session.reset();
  assert.deepEqual([...read(session, "price"), statusOf(session)], [5000, "pending"]);
  const [, , third] = requests(1);
  // With the same params in flight, reset still invalidates and asks again.
  session.reset();
  const [, , , fourth] = requests(1);
  assert.deepEqual([third.signal.aborted, fourth.signal.aborted], [true, false]);
  await third.resolve();
  assert.deepEqual([...read(session, "price"), statusOf(session)], [5000, "pending"]);
  await fourth.resolve();
  assert.deepEqual([...read(session, "price", "total"), statusOf(session)], [1100, 2200, "idle"]);
});

test("Resetting a saved record invalidates the in-flight query without querying again", async () => {
  const { open, calls } = setup();
  const saved = open({ customer: 1, price: 900 });
  saved.edit("customer", 2);
  const [asked] = calls;
  saved.reset();
  assert.deepEqual([asked.signal.aborted, calls.length, statusOf(saved)], [true, 1, "idle"]);
  await asked.resolve();
  assert.deepEqual([...read(saved, "customer", "price"), statusOf(saved)], [1, 900, "idle"]);
});

test("An operation stops and requests each query again in rules order regardless of patch order", () => {
  // The discount asks for the price of as many customers as its quantity.
  const { open, calls } = setup({
    rules: {
      discount: {
        query: { endpoint: "unitPrice", params: ({ quantity }) => ({ customer: quantity }) },
      },
    },
  });
  const session = open({ customer: 1 });
  // Each abort, by its customer, with the number of requests made by then.
  const aborted = [];
  for (const { key, signal } of calls)
    signal.addEventListener("abort", () => aborted.push([key[3].customer, calls.length]));
  session.patch({ discount: 1, price: 2, quantity: 4, customer: 3 });
  assert.deepEqual(aborted, [
    [1, 2],
    [2, 3],
  ]);
  assert.deepEqual(
    calls.slice(2).map(({ key }) => key[3].customer),
    [3, 4],
  );
});
