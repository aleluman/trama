import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { opened, scriptedLoader } from "./helpers/scripted-loader.mjs";
import { failsAt, rejects } from "./helpers/session.mjs";

const scope = "acme";
const ana = { value: 1, label: "Ana" };
const beto = { value: 2, label: "Beto" };
// An object with an own __proto__ key, as JSON.parse creates it.
const proto = (value) => JSON.parse(`{"__proto__": ${JSON.stringify(value)}}`);

// A form whose endpoints record the params each load receives. Its sessions
// share one scripted loader, so the keys of every request stay in calls.
const setup = (rules, form) => {
  const received = [];
  const sales = defineEndpoints({
    customers: endpoint.options((_, params) => {
      received.push(params);
      return Promise.resolve({ options: [], more: false });
    }),
    contacts: endpoint.list((_, params) => {
      received.push(params);
      return Promise.resolve([]);
    }),
  });
  const { defineForm, field } = createForms({ endpoints: [sales] });
  const definition = defineForm({
    fields: {
      customer: field.async("customers"),
      contact: field.async("contacts"),
      note: field.text(),
      region: field.text(),
      source: field.number(),
    },
    rules,
    form,
  });
  const scripted = scriptedLoader();
  const open = (initial) => createSession(definition, { scope, loader: scripted.loader, initial });
  const params = () => scripted.calls.map((call) => call.key[3]);
  return { open, scripted, received, params };
};

test("params runs on opening, when a value it reads changes, and on reset, and ignores unrelated edits and changes to values read with peek", async () => {
  let runs = 0;
  const { open, scripted, received, params } = setup({
    contact: {
      params: ({ customer }, { peek }) => {
        runs++;
        return customer === null ? undefined : { customer: customer.value, region: peek.region };
      },
    },
  });
  const session = open({ customer: ana });
  assert.equal(runs, 1);
  opened(session, "contact");
  assert.deepEqual(params(), [{ customer: 1, region: "" }]);
  session.edit("note", "Other");
  session.edit("region", "South");
  session.edit("customer", { ...ana, label: "Ana Marie" });
  assert.equal(runs, 1);
  assert.equal(scripted.calls.length, 1);
  session.edit("customer", beto);
  assert.equal(runs, 2);
  assert.deepEqual(params(), [
    { customer: 1, region: "" },
    { customer: 2, region: "South" },
  ]);
  session.reset();
  assert.equal(runs, 3);
  assert.deepEqual(params().at(-1), { customer: 1, region: "" });
  await scripted.calls.at(-1).resolve();
  assert.deepEqual(received, [{ customer: 1, region: "" }]);
  assert.ok(Object.isFrozen(received[0]));
});

test("params can read its own field and does not participate in value ordering or cycles", () => {
  const { open, params } = setup({
    note: { value: ({ contact }) => contact?.label ?? "" },
    contact: { params: ({ contact, note }) => ({ current: contact?.value ?? null, note }) },
  });
  const session = open();
  opened(session, "contact");
  session.edit("contact", { value: 7, label: "Carla" });
  assert.equal(session.getSnapshot().values.note, "Carla");
  assert.deepEqual(params(), [
    { current: null, note: "" },
    { current: 7, note: "Carla" },
  ]);
});

test("An undefined result suspends the option list without making a request. A null, primitive, array, or promise result rejects the operation", () => {
  const incompatible = [
    [null, "null"],
    [5, "5"],
    ["customer", '"customer"'],
    [true, "true"],
    [[1], "[object Array]"],
    [Promise.resolve({}), "[object Promise]"],
  ];
  const results = [{ customer: 0 }, ...incompatible.map(([result]) => result)];
  const { open, scripted, params } = setup({
    contact: { params: ({ source }) => (source === null ? undefined : results[source]) },
  });
  const session = open();
  const view = opened(session, "contact");
  assert.equal(view.getSnapshot().status, "suspended");
  assert.equal(scripted.calls.length, 0);
  for (const [index, [, shown]] of incompatible.entries()) {
    const message = `Field "contact" params: incompatible result ${shown}, expected a plain object or undefined`;
    assert.throws(() => open({ source: index + 1 }), { message });
    rejects(session, () => session.edit("source", index + 1), message);
  }
  assert.equal(scripted.calls.length, 0);
  session.edit("source", 0);
  assert.deepEqual(params(), [{ customer: 0 }]);
});

test("A params failure rejects opening, editing, and reset with its cause", () => {
  const boom = new Error("No parameters");
  let broken = false;
  const { open } = setup({
    contact: {
      params: ({ source }) => {
        if (broken || source === 1) throw boom;
        return {};
      },
    },
  });
  const message = 'Field "contact" params: formula failed: No parameters';
  assert.throws(() => open({ source: 1 }), { message, cause: boom });
  const session = open();
  rejects(session, () => session.edit("source", 1), message, boom);
  broken = true;
  rejects(session, () => session.reset(), message, boom);
});

// An array with a prototype of its own is not an array of data.
class Ids extends Array {}

test("params that are not plain data or have no canonical form reject the operation with their path", () => {
  const getter = Object.defineProperty({}, "total", {
    enumerable: true,
    get: () => assert.fail("getter ran"),
  });
  for (const [result, detail] of [
    [{ since: new Date(0) }, 'result must be plain data: a Date at "since"'],
    [{ load() {} }, 'result must be plain data: a function at "load"'],
    [{ filter: { ids: [1, 2n] } }, 'result must be plain data: a bigint at "filter.ids[1]"'],
    [{ ids: Ids.from([1]) }, 'result must be plain data: an Ids at "ids"'],
    [getter, 'result must be plain data: a getter at "total"'],
    [{ tags: [undefined] }, 'undefined is not allowed inside arrays at "tags[0]"'],
    [{ filter: proto(1) }, '"__proto__" is not allowed as a key at "filter"'],
    [{ a: [{ b: proto({}) }] }, '"__proto__" is not allowed as a key at "a[0].b"'],
    [proto({}), '"__proto__" is not allowed as a key'],
    // The hash of TanStack Query reads constructor to tell plain objects apart.
    [{ filter: { constructor: null } }, '"constructor" is not allowed as a key at "filter"'],
    [{ constructor: 0, a: 1 }, '"constructor" is not allowed as a key'],
  ]) {
    const { open } = setup({ contact: { params: ({ source }) => (source === 1 ? result : {}) } });
    const session = open();
    rejects(session, () => session.edit("source", 1), `Field "contact" params: ${detail}`);
  }
});

test("params is copied in canonical, frozen form and keeps its identity while the data stays equal", async () => {
  let authored;
  // The params as the author returns them, with undefined properties and -0.
  const author = ({ value }, note) => {
    const [long, nested] = [note.length > 3, { skip: undefined }];
    authored = { customer: value, long, n: -0, list: [-0, 1], nested, skip: undefined };
    return authored;
  };
  const { open, scripted, received, params } = setup({
    contact: {
      params: ({ customer, note }) => (customer === null ? undefined : author(customer, note)),
    },
  });
  const session = open({ customer: ana });
  const view = opened(session, "contact");
  const [first] = params();
  assert.deepEqual(first, { customer: 1, long: false, n: 0, list: [0, 1], nested: {} });
  for (const value of [first, first.list, first.nested]) assert.ok(Object.isFrozen(value));
  // The author's object stays theirs.
  assert.notEqual(first, authored);
  for (const value of [authored, authored.list]) assert.equal(Object.isFrozen(value), false);
  authored.list[1] = 5;
  assert.deepEqual(first.list, [0, 1]);
  await scripted.calls[0].resolve();
  assert.deepEqual(received, [first]);
  assert.ok(Object.isFrozen(received[0]));
  view.open();
  session.edit("note", "ab");
  assert.equal(scripted.calls.length, 2);
  assert.equal(params()[1], first);
  session.edit("note", "abcd");
  assert.deepEqual(params()[2], { ...first, long: true });
});

test("The endpoint receives a shared frozen {} when the params rule is absent or set to undefined", async () => {
  const { open, scripted, received, params } = setup({ customer: { params: undefined } });
  const [one, other] = [open(), open()];
  opened(one, "customer");
  opened(other, "customer");
  opened(one, "contact");
  const [first, ...rest] = params();
  assert.deepEqual(first, {});
  assert.ok(Object.isFrozen(first));
  for (const value of rest) assert.equal(value, first);
  await scripted.calls[2].resolve();
  assert.deepEqual(received, [{}]);
  assert.ok(Object.isFrozen(received[0]));
});

test("params and state formulas fail in declaration order, after values and before the form lock", () => {
  const params = failsAt(1, "params", {});
  const hidden = failsAt(1, "hidden", false);
  const lock = { readOnly: { value: failsAt(1, "form lock", false) } };
  const value = failsAt(1, "value");
  for (const [rules, form, message] of [
    [
      { contact: { params }, note: { hidden } },
      lock,
      'Field "contact" params: formula failed: params',
    ],
    [
      { note: { hidden }, contact: { params } },
      lock,
      'Field "note" hidden: formula failed: hidden',
    ],
    [{ contact: { params }, note: { value } }, lock, 'Field "note" value: formula failed: value'],
    [{ contact: { params } }, lock, 'Field "contact" params: formula failed: params'],
  ]) {
    const { open } = setup(rules, form);
    const session = open();
    rejects(session, () => session.edit("source", 1), message);
  }
});
