import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { cachingLoader, scriptedLoader, settle, shown, watch } from "./helpers/scripted-loader.mjs";

const rows = [
  { value: 1, label: "Ana" },
  { value: 2, label: "Ana\u00EFs" },
  { value: 3, label: "Ren\u00E9e" },
  { value: 4, label: "Beto", email: "anais@acme.example" },
  { value: 5, label: "\u00C9lodie" },
];
const labels = rows.map((row) => row.label);
const ready = (text, found) => ({
  status: "ready",
  text,
  labels: found,
  complete: true,
  error: undefined,
});

// A session whose contact comes from a full list and whose customer from a
// paged endpoint. Each load counts its runs and answers what the test serves.
const setup = (options = {}) => {
  const served = { contacts: rows, customers: { options: rows, more: false } };
  const loads = { contacts: 0, customers: 0 };
  const sales = defineEndpoints({
    customers: endpoint.options(() => {
      loads.customers++;
      return Promise.resolve(served.customers);
    }),
    contacts: endpoint.list(() => {
      loads.contacts++;
      return Promise.resolve(served.contacts);
    }),
  });
  const { defineForm, field } = createForms({ endpoints: [sales] });
  const definition = defineForm({
    fields: { customer: field.async("customers"), contact: field.async("contacts") },
  });
  const open = () => createSession(definition, { scope: "acme", ...options });
  return { session: open(), open, served, loads };
};

test("A full list filters locally by label, ignoring case and accents and making no requests. Each open goes through the direct loader again", async () => {
  const { session, loads } = setup();
  const { view } = watch(session, "contact");
  view.open();
  assert.equal(shown(view).status, "loading");
  await settle();
  assert.deepEqual(shown(view), ready("", labels));
  for (const [text, found] of [
    ["ANAIS", ["Ana\u00EFs"]],
    ["\u00E1n", ["Ana", "Ana\u00EFs"]],
    ["renee", ["Ren\u00E9e"]],
    ["elo", ["\u00C9lodie"]],
    ["anais@", []],
    ["", labels],
    ["an", ["Ana", "Ana\u00EFs"]],
  ]) {
    view.search(text);
    assert.deepEqual(shown(view), ready(text, found), text);
  }
  view.more();
  await settle();
  assert.equal(loads.contacts, 1, "Local searches and more make no requests");
  view.open();
  assert.equal(shown(view).status, "loading");
  await settle();
  assert.equal(loads.contacts, 2);
  assert.deepEqual(shown(view), ready("an", ["Ana", "Ana\u00EFs"]));
});

test("search on an unloaded full list requests it once and filters when it arrives, and requests it again after an error", async () => {
  const { loader, calls } = scriptedLoader();
  const { session } = setup({ loader });
  const { view } = watch(session, "contact");
  view.search("an");
  assert.deepEqual(calls[0].key, ["trama", "acme", "contacts", {}]);
  assert.deepEqual(shown(view), { ...ready("an", []), status: "loading", complete: false });
  view.search("r\u00E9n");
  assert.equal(calls.length, 1);
  await calls[0].resolve();
  assert.deepEqual(shown(view), ready("r\u00E9n", ["Ren\u00E9e"]));
  view.open();
  await calls[1].reject(new Error("No connection"));
  assert.equal(shown(view).error, 'Field "contact" list: request failed: No connection');
  view.search("be");
  assert.equal(calls.length, 3);
  await calls[2].resolve();
  assert.deepEqual(shown(view), ready("be", ["Beto"]));
});

// With a cache keyed by JSON, the invalid response fails the view and stays out
// of the cache; the valid one enters it frozen, as the view shows it, and
// serves a reopening and another session of the same scope.
const assertCached = async ([name, key, invalid, valid, cause]) => {
  const caching = cachingLoader();
  const { session, open, served, loads } = setup({ loader: caching.loader });
  served[key] = invalid;
  const { view } = watch(session, name);
  view.open();
  await settle();
  assert.equal(shown(view).error, `Field "${name}" list: request failed: ${cause}`);
  assert.equal(view.getSnapshot().error.cause.message, cause);
  assert.equal(caching.cache.size, 0, "An invalid response is not cached");
  served[key] = valid;
  view.retry();
  await settle();
  assert.equal(shown(view).status, "ready");
  const [cached] = caching.cache.values();
  const [option] = Array.isArray(cached) ? cached : cached.options;
  const [source] = Array.isArray(valid) ? valid : valid.options;
  for (const value of [cached, option, option.tags]) assert.ok(Object.isFrozen(value));
  assert.equal(view.getSnapshot().options[0], option);
  assert.notEqual(option, source);
  assert.equal(Object.isFrozen(source), false);
  view.open();
  const { view: other } = watch(open(), name);
  other.open();
  await settle();
  assert.equal(other.getSnapshot().options[0], option);
  assert.deepEqual([loads[key], caching.runs], [2, 2]);
};

test("run validates and freezes inside the loader, keeping invalid responses out of the cache and showing the cached data in the view", async () => {
  const tags = ["vip"];
  await Promise.all(
    [
      [
        "customer",
        "customers",
        { options: [{ value: 1 }], more: false },
        { options: [{ value: 1, label: "Ana", tags }], more: false },
        'Endpoint "customers" page 1: option 0: expected value and label',
      ],
      [
        "contact",
        "contacts",
        { options: [] },
        [{ value: 7, label: "Beatriz", tags }],
        'Endpoint "contacts": expected an array of options',
      ],
    ].map((row) => assertCached(row)),
  );
});

test("The snapshot is frozen, keeps its identity while unchanged, and contains the options returned by run", async () => {
  const { loader, calls } = scriptedLoader();
  const { session, served } = setup({ loader });
  const authored = { value: 1, label: "Ana", tags: ["vip"] };
  served.customers = { options: [authored], more: false };
  const { view } = watch(session, "customer");
  const first = view.getSnapshot();
  assert.equal(view.getSnapshot(), first);
  for (const value of [first, first.options]) assert.ok(Object.isFrozen(value));
  view.open();
  const page = await calls[0].resolve();
  const snapshot = view.getSnapshot();
  assert.equal(view.getSnapshot(), snapshot);
  const [ana] = snapshot.options;
  for (const value of [snapshot, snapshot.options, ana, ana.tags, page, page.options])
    assert.ok(Object.isFrozen(value));
  assert.equal(ana, page.options[0]);
  assert.notEqual(ana, authored);
  for (const value of [authored, authored.tags]) assert.equal(Object.isFrozen(value), false);
  // An option of the list is written to the session as it is.
  session.edit("customer", ana);
  assert.equal(session.getSnapshot().values.customer, ana);
});
