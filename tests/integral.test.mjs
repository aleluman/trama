import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { createSession } from "trama-forms/core";
import { order } from "../docs/site/examples/complete/order.ts";
import { scriptedLoader, watch } from "./helpers/scripted-loader.mjs";

// Every session of the order needs a scope, since its customers come from an
// endpoint, and a context: the mode, today and the currency of the company.
const scope = "demo";
const today = "2026-09-27";
const context = { mode: "edit", today, currency: { code: "JPY", taxRate: 0.2 } };
// A customer as the endpoint of the example gives it, with its metadata.
const acme = {
  value: 7,
  label: "Acme Trading",
  defaultContact: { value: 70, label: "Ana", email: "ana@acme.example" },
  deliveryHint: "Deliver to the warehouse",
};

// Choosing acme asks for its price. The scripted loader, a mock, keeps that
// request pending, so the tests of other changes check before the price arrives.
const acmePrice = ["trama", scope, "unitPrice", { customer: 7 }];
const keys = (calls) => calls.map(({ key }) => key);

const totalsFor = (net, taxRate = 0.2) => {
  const tax = Math.round(net * taxRate);
  return { net, tax, gross: net + tax };
};

test("the complete example combines default values, supplied data, and an independent baseline", () => {
  const fresh = createSession(order, { scope, context });
  assert.equal(fresh.getSnapshot().values.total, 10000);
  assert.equal(fresh.getSnapshot().fieldStates.note.disabled, false);
  fresh.watchOutputs(({ caption }) => assert.equal(caption, "Total: 12000 JPY"))();

  for (const supplied of [{}, { total: 9500 }, { total: 0 }, { total: null }]) {
    const session = createSession(order, {
      scope,
      context,
      initial: {
        country: "ES",
        city: "Barcelona",
        includeNote: false,
        note: "Saved",
        ...supplied,
      },
    });
    const baseline = session.getSnapshot();
    assert.equal(baseline.values.total, Object.hasOwn(supplied, "total") ? supplied.total : 10000);
    assert.equal(baseline.values.city, "Barcelona");
    assert.equal(baseline.fieldStates.note.disabled, true);
    const seen = [];
    const stop = session.watchOutputs(({ totals }) => seen.push(totals));
    assert.deepEqual(seen[0], totalsFor(baseline.values.total ?? 0));
    session.edit("total", 25000);
    session.edit("includeNote", true);
    session.edit("note", "Edited");
    assert.equal(session.getSnapshot().values.total, 25000);
    session.edit("quantity", 3);
    assert.deepEqual(seen.at(-1), totalsFor(15000));
    session.edit("includeNote", false);
    assert.equal(session.getSnapshot().values.note, "Edited");
    assert.equal(session.getSnapshot().fieldStates.note.disabled, true);
    session.edit("country", "MX");
    assert.equal(session.getSnapshot().values.city, "");
    session.edit("useCapital", true);
    session.edit("country", "JP");
    assert.equal(session.getSnapshot().values.city, "Tokyo");
    session.reset();
    assert.deepEqual(session.getSnapshot().values, baseline.values);
    assert.deepEqual(session.getSnapshot().fieldStates, baseline.fieldStates);
    assert.deepEqual(seen.at(-1), seen[0]);
    assert.equal(fresh.getSnapshot().values.total, 10000);
    assert.equal(fresh.getSnapshot().values.city, "");
    stop();
  }
});

test("the complete example publishes consistent values, state, and derived outputs and keeps the three failure channels separate", () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(order, { scope, context, loader });
  const accepted = [];
  const failures = [];
  const observerFailure = new Error("Output observer failed");
  session.watchOutputs(
    ({ caption }) => {
      void caption;
      throw observerFailure;
    },
    { onError: (error) => failures.push(error) },
  );
  session.subscribe(() => {
    session.watchOutputs(({ caption }) => {
      const { values, fieldStates } = session.getSnapshot();
      accepted.push([values.quantity, values.total, fieldStates.note.disabled, caption]);
    })();
  });
  const units = [];
  const unitErrors = [];
  session.watchOutputs(({ unitCaption }) => units.push(unitCaption), {
    onError: (error) => unitErrors.push(error),
  });
  session.edit("confirmed", true);
  session.edit("quantity", 3);
  assert.deepEqual(accepted.at(-1), [3, 15000, true, "Total: 18000 JPY"]);
  assert.equal(failures.at(-1), observerFailure);

  const before = session.getSnapshot();
  const publications = accepted.length;
  // A finite input overflows the rule's number result: no business validation added.
  assert.throws(() => session.edit("quantity", Number.MAX_VALUE), /total.*value/u);
  assert.equal(session.getSnapshot(), before);
  assert.equal(accepted.length, publications);
  assert.equal(units.at(-1), "5000.00 JPY per unit");
  session.watchOutputs(({ caption }) => assert.equal(caption, "Total: 18000 JPY"))();

  session.edit("quantity", 0);
  assert.deepEqual(accepted.at(-1), [0, 0, true, "Total: 0 JPY"]);
  assert.match(unitErrors.at(-1).message, /unitCaption.*unitPrice.*greater than zero/u);
  session.edit("customer", acme);
  assert.deepEqual(session.getSnapshot().values.customer, acme);
  assert.deepEqual(keys(calls), [acmePrice]);
  session.edit("quantity", 2);
  assert.deepEqual(units, ["5000.00 JPY per unit", "5000.00 JPY per unit"]);
  session.reset();
  assert.deepEqual(accepted.at(-1), [2, 10000, false, "Total: 12000 JPY"]);
});

test("the example totals preserve reference and selection and are read-only", () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(order, { scope, context, loader });
  const seen = [];
  const stop = session.watchOutputs(({ totals }) => seen.push(totals));
  const first = seen[0];
  // Same rounded content: the published reference is kept and nobody is notified.
  session.edit("total", 10000.4);
  session.edit("customer", acme);
  assert.deepEqual(seen, [first]);
  assert.deepEqual(keys(calls), [acmePrice]);
  let current;
  session.watchOutputs(({ totals }) => {
    current = totals;
  })();
  assert.equal(current, first);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Reflect.set(first, "gross", 0), false);
  session.edit("quantity", 3);
  assert.deepEqual(seen[1], totalsFor(15000));
  stop();
});

test("the order publishes its state with a required customer, an address based on the delivery method, a municipality in Spain, and a lock on confirmation", () => {
  const session = createSession(order, {
    scope,
    context,
    initial: { city: "Barcelona", useCapital: true },
  });
  const states = () => session.getSnapshot().fieldStates;
  const opened = states();
  assert.deepEqual(
    [opened.customer.required, opened.city.required, opened.city.label, opened.city.placeholder],
    [true, true, "Municipality", "E.g., Madrid"],
  );
  session.edit("delivery", "pickup");
  const address = ["country", "city", "useCapital"];
  assert.deepEqual(
    address.map((name) => states()[name].hidden),
    [true, true, true],
  );
  assert.equal(states().city.required, false);
  assert.deepEqual(session.getSnapshot().values.city, "Barcelona");
  session.edit("delivery", "shipping");
  session.edit("country", "MX");
  assert.deepEqual(
    [states().city.label, states().city.placeholder, session.getSnapshot().values.city],
    ["City", "E.g., Mexico City", "Mexico City"],
  );
  session.edit("confirmed", true);
  const locked = Object.entries(states()).filter(([, state]) => state.readOnly);
  assert.deepEqual(
    locked.map(([name]) => name),
    Object.keys(order.fields).filter((name) => name !== "confirmed"),
  );
  for (const [, state] of locked) assert.ok(state.reasons.includes("Order confirmed"));
  assert.deepEqual([states().note.disabled, states().note.reasons], [true, ["Order confirmed"]]);
  session.edit("confirmed", false);
  assert.deepEqual(
    Object.values(states()).map((state) => state.readOnly),
    Object.keys(order.fields).map(() => false),
  );
  session.reset();
  assert.deepEqual(states(), opened);
});

test("choosing a customer copies the default contact from the option, suggests the delivery hint, and requests the contacts and price", async () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(order, { scope, context, loader });
  const contacts = watch(session, "contact");
  contacts.view.open();
  assert.deepEqual([contacts.view.getSnapshot().status, calls.length], ["suspended", 0]);
  const customers = watch(session, "customer");
  customers.view.search("trading");
  const callOf = (key) => calls.find((call) => isDeepStrictEqual(call.key, key));
  await callOf(["trama", scope, "customers", {}, "trading", 1]).resolve();
  // In the simulated server, the first of them has contacts and the third has none.
  const [first, , third] = customers.view.getSnapshot().options;
  const keysOf = ({ value }) =>
    ["contacts", "unitPrice"].map((name) => ["trama", scope, name, { customer: value }]);
  const choose = (customer) => {
    session.edit("customer", customer);
    const { values, fieldStates } = session.getSnapshot();
    const asked = keysOf(customer).map((key) => callOf(key) !== undefined);
    return [values.contact, fieldStates.note.placeholder, asked];
  };
  assert.notEqual(first.defaultContact, null);
  assert.deepEqual(choose(first), [first.defaultContact, first.deliveryHint, [true, true]]);
  await callOf(keysOf(first)[0]).resolve();
  assert.deepEqual(contacts.view.getSnapshot().options, [first.defaultContact]);
  assert.deepEqual(choose(third), [null, third.deliveryHint, [true, true]]);
  assert.equal(third.defaultContact, null);
  session.edit("customer", null);
  assert.deepEqual(
    [session.getSnapshot().fieldStates.note.placeholder, contacts.view.getSnapshot().status],
    [undefined, "suspended"],
  );
  // The search, and the contacts and the price of each customer.
  assert.equal(calls.length, 5);
});

test("view mode makes the entire order read-only, including the confirmation, while create and edit leave it unlocked", () => {
  const viewed = createSession(order, { scope, context: { ...context, mode: "view" } });
  const states = () => Object.entries(viewed.getSnapshot().fieldStates);
  assert.deepEqual(
    states().map(([name]) => name),
    Object.keys(order.fields),
  );
  for (const [name, state] of states())
    assert.deepEqual(
      [name, state.readOnly, state.reasons.includes("Read-only")],
      [name, true, true],
    );
  assert.deepEqual(viewed.getSnapshot().fieldStates.confirmed.reasons, ["Read-only"]);
  // The lock of the mode has no exceptions: confirming keeps the confirmation read-only.
  viewed.edit("confirmed", true);
  assert.deepEqual(
    states().map(([name, state]) => [name, state.readOnly]),
    Object.keys(order.fields).map((name) => [name, true]),
  );
  assert.deepEqual(viewed.getSnapshot().fieldStates.confirmed.reasons, ["Read-only"]);
  for (const mode of ["create", "edit"]) {
    const session = createSession(order, { scope, context: { ...context, mode } });
    assert.deepEqual(
      Object.values(session.getSnapshot().fieldStates).map((state) => state.readOnly),
      Object.keys(order.fields).map(() => false),
    );
  }
});

test("deliveryDate takes today from context, and the totals use its currency", () => {
  const created = createSession(order, {
    scope,
    context: { ...context, mode: "create", today: "2026-10-01" },
  });
  const values = () => created.getSnapshot().values;
  assert.equal(values().deliveryDate, "2026-10-01");
  created.edit("deliveryDate", "2026-12-24");
  // The event of the country restores only the city to its default.
  created.edit("country", "MX");
  assert.deepEqual([values().deliveryDate, values().city], ["2026-12-24", ""]);
  created.reset();
  assert.equal(values().deliveryDate, "2026-10-01");
  const saved = createSession(order, { scope, context, initial: { deliveryDate: "2026-01-15" } });
  saved.edit("deliveryDate", today);
  saved.reset();
  assert.equal(saved.getSnapshot().values.deliveryDate, "2026-01-15");

  const usd = createSession(order, {
    scope,
    context: { ...context, currency: { code: "USD", taxRate: 0.1 } },
  });
  const seen = [];
  const stop = usd.watchOutputs(({ totals, caption, unitCaption }) =>
    seen.push([totals, caption, unitCaption]),
  );
  assert.deepEqual(seen[0], [totalsFor(10000, 0.1), "Total: 11000 USD", "5000.00 USD per unit"]);
  usd.edit("quantity", 3);
  assert.deepEqual(seen.at(-1), [
    totalsFor(15000, 0.1),
    "Total: 16500 USD",
    "5000.00 USD per unit",
  ]);
  stop();
  createSession(order, { scope, context }).watchOutputs(({ totals, caption }) =>
    assert.deepEqual([totals, caption], [totalsFor(10000), "Total: 12000 JPY"]),
  )();
});
