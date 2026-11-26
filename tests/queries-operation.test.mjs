import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import {
  createForms,
  createSession,
  declareContext,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

// Value query responses apply in one operation. These cases also exercise
// automatic selection, entry changes, and the identity of snapshot.queries.
// Every session asks through the scripted loader, a mock: each request waits
// until the test settles it, and resolve() runs the endpoint's load.
const scope = "acme";
const contact = (value, label) => ({ value, label });
// The contacts of each customer: one, two and one.
const contactsOf = {
  1: [contact(11, "Ana")],
  2: [contact(21, "Beto"), contact(22, "Carla")],
  3: [contact(31, "Diego")],
};
const byCustomer = ({ customer }) => (customer === null ? undefined : { customer });
const byQuantity = ({ quantity }) => (quantity === null ? undefined : { quantity });

// The server answers the quote of a customer from prices, which a test may change
// between requests; rules and the rest of the configuration go to defineForm.
const setup = ({ prices = {}, ...form }) => {
  const priceOf = (customer) => prices[customer] ?? 1000 + 100 * customer;
  const catalog = defineEndpoints({
    unitPrice: endpoint.value((_, { customer }) => Promise.resolve(priceOf(customer))),
    quote: endpoint.value((_, { customer }) =>
      Promise.resolve({ price: priceOf(customer), discount: 5 }),
    ),
    discountFor: endpoint.value((_, { quantity }) => Promise.resolve(quantity >= 10 ? 10 : 0)),
    contacts: endpoint.list((_, { customer }) => Promise.resolve(contactsOf[customer])),
  });
  const bound = createForms({ endpoints: [catalog] });
  const definition = bound.defineForm({
    ...form,
    fields: {
      customer: bound.field.number(),
      contact: bound.field.async("contacts"),
      price: bound.field.number({ default: 5000 }),
      discount: bound.field.number(),
      quantity: bound.field.number({ default: 2 }),
      total: bound.field.number(),
      note: bound.field.text(),
    },
  });
  const { loader, calls } = scriptedLoader();
  const open = (initial, context) => createSession(definition, { scope, loader, initial, context });
  // The first request to an endpoint with these params.
  const request = (name, params) =>
    calls.find(({ key }) => isDeepStrictEqual(key, ["trama", scope, name, params]));
  return { open, calls, request };
};
const read = (session, ...names) => names.map((name) => session.getSnapshot().values[name]);
const statusOf = (session, name = "price") => session.getSnapshot().queries[name].status;

// The quote writes the price of the entry and the discount; the total follows
// both and an event of the price writes the note with both, so it sees the whole
// patch.
const quoteRules = (rules) => ({
  price: {
    query: {
      endpoint: "quote",
      params: byCustomer,
      patch: ({ price, discount }) => ({ price, discount }),
    },
    onChange: ({ price, discount }) => ({ note: `Price ${price} - ${discount}` }),
  },
  total: {
    value: ({ quantity, price, discount }) => (quantity ?? 0) * (price ?? 0) - (discount ?? 0),
  },
  ...rules,
});

test("A multi-field patch is one operation. Formulas and events run, publication happens once without a change to resetVersion, and derived outputs are recalculated once", async () => {
  let evaluated = 0;
  const { open, calls } = setup({
    rules: quoteRules(),
    outputs: ({ output }) => ({
      net: output(({ price, discount }) => {
        evaluated++;
        return (price ?? 0) - (discount ?? 0);
      }),
    }),
  });
  const session = open({ customer: 1 });
  const before = session.getSnapshot();
  const published = [];
  session.subscribe(() => published.push(session.getSnapshot()));
  const nets = [];
  session.watchOutputs(({ net }) => nets.push(net));
  const runs = evaluated;
  await calls[0].resolve();
  assert.deepEqual(read(session, "price", "discount", "total", "note"), [
    1100,
    5,
    2195,
    "Price 1100 - 5",
  ]);
  assert.equal(published.length, 1);
  assert.equal(published[0].resetVersion, before.resetVersion);
  assert.equal(statusOf(session), "idle");
  assert.equal(evaluated, runs + 1);
  assert.deepEqual(nets, [5000, 1095]);
});

test("If a formula fails in the response operation, nothing is written and the query stays in error until retry", async () => {
  const boom = new Error("No total");
  const prices = { 3: 1300 };
  // It fails only with both destinations of the patch written.
  const failing = ({ quantity, price, discount }) => {
    if (price === 1300 && discount === 5) throw boom;
    return (quantity ?? 0) * (price ?? 0) - (discount ?? 0);
  };
  const { open, calls } = setup({ prices, rules: quoteRules({ total: { value: failing } }) });
  const session = open({ customer: 3 });
  const before = session.getSnapshot();
  let notifications = 0;
  session.subscribe(() => notifications++);
  await calls[0].resolve();
  const after = session.getSnapshot();
  const { status, error } = after.queries.price;
  const cause = 'Field "total" value: formula failed: No total';
  assert.equal(status, "error");
  assert.equal(error.message, `Field "price" query: response operation failed: ${cause}`);
  assert.equal(error.cause.message, cause);
  // Only the state of the query changed.
  assert.equal(after.values, before.values);
  assert.equal(after.fieldStates, before.fieldStates);
  assert.deepEqual([after.resetVersion, notifications], [before.resetVersion, 1]);
  session.edit("note", "Other");
  // No destination was written, not even in the next operation.
  assert.deepEqual(read(session, "price", "discount", "total"), [5000, null, 10000]);
  assert.equal(statusOf(session), "error");
  prices[3] = 1350;
  session.retry("price");
  assert.deepEqual(session.getSnapshot().queries.price, { status: "pending", error: undefined });
  await calls[1].resolve();
  assert.deepEqual(read(session, "price", "discount", "note"), [1350, 5, "Price 1350 - 5"]);
  assert.equal(statusOf(session), "idle");
});

// In create mode, the only contact of the customer is chosen if the field is empty.
const autoselect = (seen) => ({
  contact: {
    query: {
      endpoint: "contacts",
      params: ({ customer }, { context }) =>
        context.mode === "create" && customer !== null ? { customer } : undefined,
      patch: (options, tools) => {
        seen.push({ options, ...tools });
        const empty = tools.values.contact === null;
        return empty && options.length === 1 ? { contact: options[0] } : undefined;
      },
    },
  },
});

test("In create mode, auto-selection picks the only contact if the field is empty. With two contacts or one already selected it does not write, and in edit mode it does not query", async () => {
  const seen = [];
  const { open, calls, request } = setup({ context: declareContext(), rules: autoselect(seen) });
  const created = open(undefined, { mode: "create" });
  created.edit("customer", 1);
  const before = created.getSnapshot();
  await request("contacts", { customer: 1 }).resolve();
  assert.deepEqual(read(created, "contact"), [contact(11, "Ana")]);
  // The patch receives the frozen list, the current values and the context.
  const [{ options, values, context }] = seen;
  assert.deepEqual(options, contactsOf[1]);
  assert.ok(Object.isFrozen(options) && Object.isFrozen(options[0]));
  assert.equal(values, before.values);
  assert.deepEqual(context, { mode: "create" });
  created.edit("customer", 3);
  await request("contacts", { customer: 3 }).resolve();
  assert.deepEqual(
    [...read(created, "contact"), statusOf(created, "contact")],
    [contact(11, "Ana"), "idle"],
  );
  const other = open(undefined, { mode: "create" });
  other.edit("customer", 2);
  await request("contacts", { customer: 2 }).resolve();
  assert.deepEqual([...read(other, "contact"), statusOf(other, "contact")], [null, "idle"]);
  const edited = open(undefined, { mode: "edit" });
  edited.edit("customer", 1);
  assert.deepEqual([calls.length, statusOf(edited, "contact")], [3, "idle"]);
});

test("Changing the entry field leaves the query idle in that operation's snapshot, including from error. If the parameters change in the same operation, a new query starts", async () => {
  // Choosing another customer clears the price: the entry and the params change together.
  const { open, calls, request } = setup({
    rules: {
      price: { query: { endpoint: "unitPrice", params: byCustomer } },
      customer: { onChange: () => ({ price: null }) },
    },
  });
  const session = open({ customer: 1 });
  const [first] = calls;
  const published = [];
  session.subscribe(() => published.push(session.getSnapshot()));
  session.edit("price", 900);
  assert.deepEqual(
    published.map(({ values, queries }) => [values.price, queries.price.status]),
    [[900, "idle"]],
  );
  assert.equal(first.signal.aborted, true);
  session.edit("customer", 2);
  const second = request("unitPrice", { customer: 2 });
  assert.deepEqual(
    [...read(session, "price"), statusOf(session), calls.length],
    [null, "pending", 2],
  );
  await second.reject(new Error("No connection"));
  assert.equal(statusOf(session), "error");
  session.edit("price", 800);
  assert.deepEqual(session.getSnapshot().queries.price, { status: "idle", error: undefined });
  assert.equal(calls.length, 2);
});

test("snapshot.queries contains only entries with query, is frozen, and keeps its identity and each entry's identity during unrelated operations", async () => {
  const plain = createSession(defineForm({ fields: { note: field.text() } }));
  const empty = plain.getSnapshot().queries;
  assert.deepEqual(empty, {});
  plain.edit("note", "Other");
  plain.reset();
  assert.equal(plain.getSnapshot().queries, empty);
  assert.ok(Object.isFrozen(empty));
  const { open, request } = setup({
    rules: {
      price: { query: { endpoint: "unitPrice", params: byCustomer } },
      discount: { query: { endpoint: "discountFor", params: byQuantity } },
    },
  });
  const session = open({ customer: 1 });
  const opened = session.getSnapshot().queries;
  const pending = { status: "pending", error: undefined };
  assert.deepEqual(opened, { price: pending, discount: pending });
  for (const value of [opened, opened.price, opened.discount]) assert.ok(Object.isFrozen(value));
  session.edit("note", "Other");
  assert.equal(session.getSnapshot().queries, opened);
  await request("discountFor", { quantity: 2 }).resolve();
  const answered = session.getSnapshot().queries;
  assert.notEqual(answered, opened);
  assert.equal(answered.price, opened.price);
  assert.deepEqual(answered.discount, { status: "idle", error: undefined });
  session.edit("note", "More");
  assert.equal(session.getSnapshot().queries, answered);
  // Editing the price changes only its entry.
  session.edit("price", 900);
  const edited = session.getSnapshot().queries;
  assert.equal(edited.discount, answered.discount);
  assert.deepEqual(edited.price, { status: "idle", error: undefined });
});

test("An edit or response that writes the initial value again after a different one keeps the initial option", async () => {
  // contact is declared before price, so the event of price starts the candidate
  // again once the formula wrote another contact: the draft no longer holds the
  // opening option when the event writes one with its value.
  const { open, calls } = setup({
    rules: {
      contact: { value: ({ price }) => (price === 1100 ? contact(21, "Beto") : undefined) },
      price: {
        query: { endpoint: "unitPrice", params: byCustomer },
        onChange: () => ({ contact: contact(11, "New") }),
      },
    },
  });
  const edited = open({ customer: 1, contact: contact(11, "Ana") });
  const answered = open({ customer: 1, contact: contact(11, "Ana") });
  const [opening] = read(edited, "contact");
  edited.edit("price", 1100);
  assert.equal(read(edited, "contact")[0], opening);
  const [held] = read(answered, "contact");
  await calls[1].resolve();
  assert.equal(read(answered, "price")[0], 1100);
  assert.equal(read(answered, "contact")[0], held);
});
