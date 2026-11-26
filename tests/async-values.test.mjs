import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const scope = "acme";
const { defineForm, field } = createForms({
  endpoints: [
    defineEndpoints({
      customers: endpoint.options(() => Promise.resolve({ options: [], more: false })),
      contacts: endpoint.list(() => Promise.resolve([])),
    }),
  ],
});
// An option with nested metadata, as the author writes it.
const option = (value, label = `Customer ${value}`) => ({
  value,
  label,
  address: { city: "Madrid" },
  tags: ["vip"],
});
// customer is written by a formula from pick and contact by a patch from send,
// each with the item of that index. counts records the events of both async
// fields and the runs of a formula of state that reads them.
const counter = () => ({ changes: 0, reads: 0 });
const form = (items = [], counts = counter()) => {
  const changed = () => void counts.changes++;
  return defineForm({
    fields: {
      customer: field.async("customers", { label: "Customer" }),
      contact: field.async("contacts"),
      pick: field.number(),
      send: field.number(),
      note: field.text(),
    },
    rules: {
      customer: {
        value: ({ pick }) => (pick === null ? undefined : items[pick]),
        onChange: changed,
      },
      contact: { onChange: changed },
      send: { onChange: ({ send }) => (send === null ? undefined : { contact: items[send] }) },
      note: {
        label: ({ customer, contact }) => {
          counts.reads++;
          return `${customer?.label} / ${contact?.label}`;
        },
      },
    },
  });
};
const open = (definition, initial) => createSession(definition, { scope, initial });
const valuesOf = (session) => session.getSnapshot().values;
// The option the session holds is a deep frozen copy of the author's object,
// which stays theirs.
const assertCopy = (held, authored) => {
  assert.notEqual(held, authored);
  assert.deepEqual(held, authored);
  for (const key of ["address", "tags"]) assert.notEqual(held[key], authored[key]);
  for (const value of [held, held.address, held.tags]) assert.ok(Object.isFrozen(value));
  for (const value of [authored, authored.address, authored.tags])
    assert.equal(Object.isFrozen(value), false);
  authored.address.city = "Other";
  assert.equal(held.address.city, "Madrid");
};

test("initial, edit, formulas, and patches accept only complete options", () => {
  const shapes = [
    [5, "5"],
    ["1", '"1"'],
    [true, "true"],
    [[], "[object Array]"],
    [{ value: 1 }, "[object Object]"],
    [{ label: "A" }, "[object Object]"],
    [{ value: Number.NaN, label: "A" }, "[object Object]"],
    [{ value: {}, label: "A" }, "[object Object]"],
    [{ value: 1, label: 2 }, "[object Object]"],
  ];
  const session = open(form([...shapes.map(([value]) => value), option(1)]));
  for (const [index, [value, shown]] of shapes.entries()) {
    const message = `Field "customer" (async): incompatible value ${String(value)}`;
    assert.throws(() => open(form(), { customer: value }), { message });
    rejects(session, () => session.edit("customer", value), message);
    rejects(
      session,
      () => session.edit("pick", index),
      `Field "customer" value: incompatible result ${shown} for a async field`,
    );
    rejects(
      session,
      () => session.edit("send", index),
      `Field "send" onChange: incompatible value ${shown} for async field "contact"`,
    );
  }
  session.edit("pick", shapes.length);
  session.edit("send", shapes.length);
  assert.deepEqual([valuesOf(session).customer, valuesOf(session).contact], [option(1), option(1)]);
  session.edit("customer", { value: "ES", label: "" });
  session.edit("contact", null);
  assert.deepEqual(valuesOf(session).customer, { value: "ES", label: "" });
  assert.equal(valuesOf(session).contact, null);
});

test("Reselecting the same value keeps the current option, ignores new metadata, and runs neither events nor formulas", () => {
  const counts = counter();
  const items = [
    { value: 1, label: "Another name", extra: true },
    { value: 2, label: "Another contact", tags: [] },
  ];
  const initial = { customer: option(1, "Ana"), contact: option(2, "Beto") };
  const session = open(form(items, counts), initial);
  const { customer, contact } = valuesOf(session);
  const opened = { ...counts };
  // Directly, through a formula and through a patch.
  session.edit("customer", { ...items[0] });
  session.edit("pick", 0);
  session.edit("contact", { ...items[1] });
  session.edit("send", 1);
  assert.equal(valuesOf(session).customer, customer);
  assert.equal(valuesOf(session).contact, contact);
  assert.deepEqual(counts, opened);
  assert.equal(session.getSnapshot().fieldStates.note.label, "Ana / Beto");
  // Another value, or the same value of another type, is a change.
  session.edit("customer", { value: "1", label: "One" });
  session.edit("contact", option(3, "Carla"));
  assert.equal(counts.changes, 2);
  assert.equal(session.getSnapshot().fieldStates.note.label, "One / Carla");
});

test("Each write stores a deeply frozen copy independent of the author's object", () => {
  const initial = option(1);
  assertCopy(valuesOf(open(form(), { customer: initial })).customer, initial);
  const edited = option(2);
  const session = open(form());
  session.edit("customer", edited);
  assertCopy(valuesOf(session).customer, edited);
  const [formula, patch] = [option(3), option(4)];
  const written = open(form([formula, patch]));
  written.edit("pick", 0);
  written.edit("send", 1);
  assertCopy(valuesOf(written).customer, formula);
  assertCopy(valuesOf(written).contact, patch);
  // What Trama already copied is written as it is.
  const other = open(form());
  other.edit("customer", valuesOf(written).customer);
  assert.equal(valuesOf(other).customer, valuesOf(written).customer);
});

// Each datum that is not plain, with the path the diagnostic names.
const money = new (class Money {
  amount = 1;
})();
const cyclic = { name: "meta" };
cyclic.self = cyclic;
const accessor = (descriptor) =>
  Object.defineProperty({}, "total", { ...descriptor, enumerable: true });
// An array with a prototype of its own, as a subclass of Array makes, is not data.
const tags = Object.setPrototypeOf(
  ["vip"],
  Object.create(Array.prototype, { constructor: { value: function Tags() {} } }),
);
const notPlain = () => [
  [{ since: new Date(0) }, 'a Date at "since"'],
  [{ load() {} }, 'a function at "load"'],
  [{ address: { createdAt: new Date(0) } }, 'a Date at "address.createdAt"'],
  [{ tags: ["vip", Symbol("x")] }, 'a symbol at "tags[1]"'],
  [{ contacts: [{ value: 1 }, { since: new Map() }] }, 'a Map at "contacts[1].since"'],
  [{ price: money }, 'a Money at "price"'],
  [{ tags }, 'a Tags at "tags"'],
  [{ total: 1n }, 'a bigint at "total"'],
  [{ total: Number.NaN }, 'a non-finite number at "total"'],
  [{ total: -Infinity }, 'a non-finite number at "total"'],
  [accessor({ get: () => assert.fail("getter ran") }), 'a getter at "total"'],
  [accessor({ set: () => assert.fail("setter ran") }), 'a setter at "total"'],
  [{ meta: { [Symbol("key")]: 1 } }, 'a symbol key at "meta"'],
  [{ meta: cyclic }, 'a cycle at "meta.self"'],
];
// The option with the metadata, which a spread would read through a getter.
const withMetadata = (metadata) =>
  Object.defineProperties({ value: 1, label: "Ana" }, Object.getOwnPropertyDescriptors(metadata));

test("Data that is not plain is reported with its path in initial, edit, default, formulas, and patches", () => {
  const cases = notPlain();
  const items = cases.map(([metadata]) => withMetadata(metadata));
  const session = open(form(items));
  for (const [index, [, detail]] of cases.entries()) {
    const reason = `option must be plain data: ${detail}`;
    const message = `Field "customer" (async): ${reason}`;
    assert.throws(() => open(form(), { customer: items[index] }), { message });
    rejects(session, () => session.edit("customer", items[index]), message);
    const customer = field.async("customers", { default: items[index] });
    assert.throws(() => defineForm({ fields: { customer } }), { message });
    rejects(
      session,
      () => session.edit("pick", index),
      `Field "customer" value: incompatible result for async field: ${reason}`,
    );
    rejects(
      session,
      () => session.edit("send", index),
      `Field "send" onChange: incompatible value for async field "contact": ${reason}`,
    );
  }
  // Aliases without a cycle, undefined and null are data.
  const shared = { city: "Madrid" };
  session.edit("customer", { value: 1, label: "Ana", home: shared, work: shared, fax: null });
  session.edit("contact", { value: 2, label: "Beto", note: undefined });
  assert.deepEqual(valuesOf(session).customer.work, shared);
});

test("A formula reads metadata and an event copies it to another async field", () => {
  const beatriz = { value: 7, label: "Beatriz", email: "beatriz@acme.example" };
  const acme = { value: 1, label: "Acme", defaultContact: beatriz, deliveryHint: "Front desk" };
  const definition = defineForm({
    fields: {
      customer: field.async("customers"),
      contact: field.async("contacts"),
      note: field.text({ placeholder: "Note" }),
      hint: field.text(),
    },
    rules: {
      customer: { onChange: ({ customer }) => ({ contact: customer?.defaultContact ?? null }) },
      note: { placeholder: ({ customer }) => customer?.deliveryHint },
      hint: { value: ({ customer }) => customer?.deliveryHint ?? "" },
    },
  });
  const session = open(definition);
  const placeholder = () => session.getSnapshot().fieldStates.note.placeholder;
  session.edit("customer", acme);
  assert.deepEqual(valuesOf(session).contact, beatriz);
  assert.ok(Object.isFrozen(valuesOf(session).contact));
  assert.equal(Object.isFrozen(beatriz), false);
  assert.deepEqual([valuesOf(session).hint, placeholder()], ["Front desk", "Front desk"]);
  session.edit("customer", null);
  assert.equal(valuesOf(session).contact, null);
  assert.deepEqual([valuesOf(session).hint, placeholder()], ["", "Note"]);
});

test("A complete default option is copied and frozen, toDefaults writes it, and reset restores the opening option", () => {
  const authored = option(1, "Default");
  const definition = defineForm({
    fields: {
      customer: field.async("customers", { default: authored }),
      contact: field.async("contacts", { default: null }),
      clear: field.checkbox(),
    },
    rules: {
      clear: {
        onChange: ({ clear }, { toDefaults }) =>
          clear ? toDefaults("customer", "contact") : undefined,
      },
    },
  });
  assertCopy(definition.fields.customer.default, authored);
  authored.label = "Changed";
  const session = open(definition);
  const expected = option(1, "Default");
  assert.deepEqual(valuesOf(session).customer, expected);
  assert.ok(Object.isFrozen(valuesOf(session).customer.address));
  session.edit("customer", option(2));
  session.edit("contact", option(3));
  session.edit("clear", true);
  assert.deepEqual(valuesOf(session), { customer: expected, contact: null, clear: true });
  assert.ok(Object.isFrozen(valuesOf(session).customer.tags));
  // Reset publishes the opening option again, without a copy.
  const supplied = open(definition, { customer: option(5) });
  const opened = valuesOf(supplied).customer;
  supplied.edit("customer", option(6));
  supplied.reset();
  assert.equal(valuesOf(supplied).customer, opened);
  for (const value of [5, { value: 1 }]) {
    const customer = { type: "async", endpoint: "customers", default: value };
    assert.throws(() => defineForm({ fields: { customer } }), {
      message: `Field "customer" (async): incompatible value ${String(value)}`,
    });
  }
});

test("An option written in the candidate is kept if another writer writes the same value in the same operation", () => {
  const definition = defineForm({
    fields: { customer: field.async("customers"), tick: field.checkbox() },
    rules: {
      customer: { value: ({ tick }) => (tick ? { value: 1, label: "First" } : undefined) },
      tick: { onChange: () => ({ customer: { value: 1, label: "Second" } }) },
    },
  });
  const session = open(definition);
  session.edit("tick", true);
  assert.deepEqual(valuesOf(session).customer, { value: 1, label: "First" });
});
