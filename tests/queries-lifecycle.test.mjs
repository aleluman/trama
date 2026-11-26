import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader, settle } from "./helpers/scripted-loader.mjs";
import { rejects } from "./helpers/session.mjs";

// The life of a value query: when it asks, retry, the request its load receives,
// the answers that write nothing and the operations that do not invalidate it.
// Sessions ask through the scripted loader, a mock: each request waits until the
// test settles it, and resolve() runs the endpoint's load as the direct loader
// does. With direct, they use the direct loader of createSession instead.
const scope = "acme";
const byCustomer = ({ customer }) => (customer === null ? undefined : { customer });
const keyOf = (customer) => ["trama", scope, "unitPrice", { customer }];
const priceOf = (served, customer) =>
  Object.hasOwn(served, customer) ? served[customer] : 1000 + 100 * customer;

// The server answers served[customer] if the test set it. query extends the
// query of the price and entry its rules entry; loads records what load received.
const setup = ({ served = {}, query, entry, rules, direct = false } = {}) => {
  const loads = [];
  const catalog = defineEndpoints({
    unitPrice: endpoint.value((request, params) => {
      loads.push({ request, params });
      return Promise.resolve(priceOf(served, params.customer));
    }),
  });
  const { defineForm, field } = createForms({ endpoints: [catalog] });
  const definition = defineForm({
    fields: {
      customer: field.number(),
      price: field.number({ default: 5000 }),
      discount: field.number(),
      total: field.number(),
    },
    rules: {
      price: { query: { endpoint: "unitPrice", params: byCustomer, ...query }, ...entry },
      total: { value: ({ price }) => (price ?? 0) * 2 },
      ...rules,
    },
  });
  const { loader, calls } = scriptedLoader();
  const open = (initial) =>
    createSession(definition, { scope, initial, loader: direct ? undefined : loader });
  const requests = (customer) => calls.filter(({ key }) => isDeepStrictEqual(key, keyOf(customer)));
  return { open, calls, requests, loads };
};
const read = (session, ...names) => names.map((name) => session.getSnapshot().values[name]);
const queryOf = (session) => session.getSnapshot().queries.price;
const idle = { status: "idle", error: undefined };

test("The query makes a request when the session is created with no subscribers, and its response writes without subscribers", async () => {
  const { open, calls } = setup();
  const session = open({ customer: 1 });
  assert.deepEqual(
    calls.map(({ key }) => key),
    [keyOf(1)],
  );
  assert.deepEqual(queryOf(session), { status: "pending", error: undefined });
  await calls[0].resolve();
  assert.deepEqual([...read(session, "price", "total"), queryOf(session)], [1100, 2200, idle]);
});

test("retry opens a new generation with the same params even if another is pending, and the previous response no longer writes", async () => {
  const { open, requests } = setup();
  const session = open({ customer: 1 });
  session.retry("price");
  const [first, second] = requests(1);
  assert.deepEqual([first.signal.aborted, second.signal.aborted], [true, false]);
  assert.deepEqual(queryOf(session), { status: "pending", error: undefined });
  const before = session.getSnapshot();
  await first.resolve();
  assert.equal(session.getSnapshot(), before);
  await second.resolve();
  assert.deepEqual([...read(session, "price"), queryOf(session)], [1100, idle]);
});

test("retry after a response makes another request and publishes only the state change. It does nothing while suspended", async () => {
  const { open, calls, requests } = setup();
  const session = open({ customer: 1 });
  await calls[0].resolve();
  const answered = session.getSnapshot();
  const published = [];
  session.subscribe(() => published.push(session.getSnapshot()));
  session.retry("price");
  assert.equal(requests(1).length, 2);
  const [retried] = published;
  assert.deepEqual([published.length, retried.queries.price.status], [1, "pending"]);
  assert.equal(retried.values, answered.values);
  assert.equal(retried.fieldStates, answered.fieldStates);
  assert.equal(retried.resetVersion, answered.resetVersion);
  session.edit("customer", null);
  const suspended = session.getSnapshot();
  session.retry("price");
  assert.equal(session.getSnapshot(), suspended);
  assert.deepEqual([published.length, calls.length], [2, 2]);
});

test("With the direct loader, load receives a frozen request with its signal, scope, and frozen params, and invalidating aborts that signal", async () => {
  const { open, loads } = setup({ direct: true });
  const session = open({ customer: 1 });
  const [{ request, params }] = loads;
  assert.deepEqual(Object.keys(request).toSorted(), ["scope", "signal"]);
  assert.equal(request.scope, scope);
  assert.ok(request.signal instanceof AbortSignal);
  assert.ok(Object.isFrozen(request) && Object.isFrozen(params));
  assert.deepEqual(params, { customer: 1 });
  session.edit("customer", null);
  assert.equal(request.signal.aborted, true);
  await settle();
  assert.deepEqual([...read(session, "price"), queryOf(session)], [5000, idle]);
  // The scripted loader receives a frozen key, with the params of a full list.
  const scripted = setup();
  scripted.open({ customer: 2 }).edit("customer", 3);
  const [first, second] = scripted.calls;
  assert.deepEqual(first.key, keyOf(2));
  assert.ok(Object.isFrozen(first.key) && Object.isFrozen(first.key[3]));
  assert.deepEqual([first.signal.aborted, second.signal.aborted], [true, false]);
});

test("An undefined result without a patch or an undefined patch leaves the query idle without writing", async () => {
  const cases = [setup({ served: { 1: undefined } }), setup({ query: { patch: () => {} } })];
  const sessions = cases.map(({ open }) => open({ customer: 1 }));
  const before = sessions.map((session) => session.getSnapshot());
  await Promise.all(cases.map(({ calls }) => calls[0].resolve()));
  for (const [index, session] of sessions.entries()) {
    assert.equal(session.getSnapshot().values, before[index].values);
    assert.deepEqual(queryOf(session), idle);
  }
});

test("An undefined patch property is neither written nor counted as a destination", async () => {
  const { open, calls } = setup({ query: { patch: (price) => ({ price, discount: undefined }) } });
  const session = open({ customer: 1 });
  session.edit("discount", 10);
  await calls[0].resolve();
  assert.deepEqual([...read(session, "price", "discount"), queryOf(session)], [1100, 10, idle]);
});

test("A response equal to the current value publishes state without running onChange or changing values", async () => {
  let changes = 0;
  const { open, calls } = setup({
    served: { 1: 5000 },
    entry: { onChange: () => void changes++ },
  });
  const session = open({ customer: 1 });
  const before = session.getSnapshot();
  let notifications = 0;
  session.subscribe(() => notifications++);
  await calls[0].resolve();
  assert.equal(session.getSnapshot().values, before.values);
  assert.deepEqual([changes, notifications, queryOf(session)], [0, 1, idle]);
});

// A total that fails when the price is 13.
const failsAt13 = ({ price }) => {
  if (price === 13) throw new Error("No total");
  return (price ?? 0) * 2;
};

test("A rejected operation neither invalidates the query nor changes the revision of its destinations", async () => {
  const { open, calls } = setup({ rules: { total: { value: failsAt13 } } });
  const session = open({ customer: 1 });
  rejects(
    session,
    () => session.edit("price", 13),
    'Field "total" value: formula failed: No total',
  );
  rejects(
    session,
    () => session.edit("customer", "two"),
    'Field "customer" (number): incompatible value two',
  );
  assert.deepEqual(
    [queryOf(session).status, calls.length, calls[0].signal.aborted],
    ["pending", 1, false],
  );
  await calls[0].resolve();
  assert.deepEqual([...read(session, "price", "total"), queryOf(session)], [1100, 2200, idle]);
});

test("A patch that edits the session and invalidates its own generation does not write. The new query remains", async () => {
  let session;
  // patch is code of the application: at the price of customer 1 it moves to customer 2.
  const moves = (price) => {
    if (price === 1100) session.edit("customer", 2);
    return { price };
  };
  const { open, requests } = setup({ query: { patch: moves } });
  session = open({ customer: 1 });
  await requests(1)[0].resolve();
  assert.deepEqual(
    [...read(session, "customer", "price"), queryOf(session).status, requests(2).length],
    [2, 5000, "pending", 1],
  );
  await requests(2)[0].resolve();
  assert.deepEqual([...read(session, "customer", "price"), queryOf(session)], [2, 1200, idle]);
});

// A form whose price is asked for with load, through the direct loader.
const direct = (load) => {
  const { defineForm, field } = createForms({
    endpoints: [defineEndpoints({ unitPrice: endpoint.value(load) })],
  });
  const definition = defineForm({
    fields: { customer: field.number(), price: field.number(), note: field.text() },
    rules: { price: { query: { endpoint: "unitPrice", params: byCustomer } } },
  });
  return (initial) => createSession(definition, { scope, initial });
};

test("A synchronous load that operates on the session while it tracks its queries throws, and the session loses no edits", async () => {
  let session;
  const open = direct(() => {
    session.edit("note", "inside");
    return Promise.resolve(1);
  });
  session = open();
  const seen = [];
  session.subscribe(() => seen.push(session.getSnapshot().values.note));
  session.edit("customer", 1);
  assert.deepEqual([read(session, "note"), seen], [[""], [""]]);
  await settle();
  const { status, error } = queryOf(session);
  assert.deepEqual(
    [status, error.message],
    ["error", 'Field "price" query: request failed: Cannot edit a session during its notification'],
  );
  // The engine and the snapshot agree: an edit without difference changes nothing.
  session.edit("customer", 1);
  assert.deepEqual(read(session, "customer", "note"), [1, ""]);
});

test("An abort handler that calls retry throws, and the query is not left with an orphaned request", () => {
  let session;
  let loads = 0;
  const thrown = [];
  const open = direct((request) => {
    loads++;
    request.signal.addEventListener("abort", () => {
      try {
        session.retry("price");
      } catch (error) {
        thrown.push(error.message);
      }
    });
    return new Promise(() => {});
  });
  session = open({ customer: 1 });
  session.edit("price", 7);
  assert.deepEqual(
    [thrown, loads, queryOf(session)],
    [["Cannot retry a session during its notification"], 1, idle],
  );
});
