import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";

const page = () => Promise.resolve({ options: [], more: false });
const list = () => Promise.resolve([]);
const sales = () =>
  defineEndpoints({ customers: endpoint.options(page), contacts: endpoint.list(list) });
const accounting = () => defineEndpoints({ accounts: endpoint.options(page) });

test("createForms binds field and defineForm to their registries, and the definition stores only the key", () => {
  const registry = accounting();
  const bound = createForms({ endpoints: [sales(), registry] });
  assert.deepEqual(bound.field.async("customers"), { type: "async", endpoint: "customers" });
  assert.deepEqual(
    bound.field.async("accounts", { label: "Account", placeholder: "Search", required: true }),
    {
      label: "Account",
      placeholder: "Search",
      required: true,
      type: "async",
      endpoint: "accounts",
    },
  );
  const definition = bound.defineForm({
    fields: {
      customer: bound.field.async("customers"),
      contact: bound.field.async("contacts", { label: "Contact" }),
      account: bound.field.async("accounts"),
      note: bound.field.text(),
    },
  });
  assert.deepEqual(definition.fields.customer, { type: "async", endpoint: "customers" });
  assert.deepEqual(definition.fields.contact, {
    label: "Contact",
    type: "async",
    endpoint: "contacts",
  });
  const session = createSession(definition, { scope: "acme" });
  assert.deepEqual(session.getSnapshot().values, {
    customer: null,
    contact: null,
    account: null,
    note: "",
  });
  assert.equal(session.getSnapshot().fieldStates.contact.label, "Contact");
  // A registry serves several applications of createForms.
  const other = createForms({ endpoints: [registry] });
  assert.deepEqual(other.field.async("accounts"), { type: "async", endpoint: "accounts" });
});

test("endpoint.options and endpoint.list require a load function", () => {
  for (const kind of ["options", "list"])
    for (const load of [5, undefined, null, "load", { load: page }])
      assert.throws(() => endpoint[kind](load), { message: "Endpoint: load must be a function" });
});

test("defineEndpoints requires an object of endpoints created with endpoint.options or endpoint.list", () => {
  for (const endpoints of [5, null, [], [endpoint.options(page)]])
    assert.throws(() => defineEndpoints(endpoints), {
      message: "Endpoints must be an object of endpoints",
    });
  for (const value of [
    5,
    undefined,
    page,
    { load: page },
    { kind: "options", load: page },
    sales(),
  ])
    assert.throws(() => defineEndpoints({ customers: endpoint.list(list), x: value }), {
      message:
        'Endpoint "x" must be created with endpoint.options, endpoint.list or endpoint.value',
    });
});

test("createForms requires endpoints, an array of defineEndpoints registries, and accepts no other properties", () => {
  const registry = sales();
  for (const config of [
    undefined,
    {},
    { endpoints: 5 },
    { endpoints: registry },
    { endpoints: [5] },
    { endpoints: [registry, null] },
    { endpoints: [{ customers: endpoint.options(page) }] },
    { endpoints: [registry], extra: true },
  ])
    assert.throws(() => createForms(config), {
      message: "createForms requires endpoints: an array of registries",
    });
});

test("a key declared in two createForms registries is rejected", () => {
  const repeated = defineEndpoints({ customers: endpoint.list(list) });
  for (const endpoints of [
    [sales(), repeated],
    [repeated, accounting(), sales()],
  ])
    assert.throws(() => createForms({ endpoints }), {
      message: 'Endpoint "customers" is declared in two registries',
    });
  createForms({ endpoints: [sales(), accounting()] });
});

test("bound field.async rejects a key missing from its registry when the field is created", () => {
  const { field: bound } = createForms({ endpoints: [sales()] });
  for (const [key, shown] of [
    ["custmers", '"custmers"'],
    ["accounts", '"accounts"'],
    ["toString", '"toString"'],
    ["__proto__", '"__proto__"'],
    [5, "5"],
    [undefined, "undefined"],
  ])
    assert.throws(() => bound.async(key), { message: `Unknown endpoint ${shown}` });
});

test("defineForm from trama-forms/core rejects async fields, including those created with the bound field", () => {
  const { field: bound } = createForms({ endpoints: [sales()] });
  for (const customer of [
    bound.async("customers"),
    bound.async("contacts", { label: "Contact" }),
    { type: "async", endpoint: "customers" },
  ])
    assert.throws(() => defineForm({ fields: { title: field.text(), customer } }), {
      message: 'Field "customer" (async): define the form with the defineForm of createForms',
    });
});

test("bound defineForm rejects an async field with a key from another registry or with a value that is not a key", () => {
  const other = createForms({ endpoints: [accounting()] });
  const { defineForm: bound } = createForms({ endpoints: [sales()] });
  for (const [customer, message] of [
    [other.field.async("accounts"), 'Field "customer" (async): unknown endpoint "accounts"'],
    [
      { type: "async", endpoint: "toString" },
      'Field "customer" (async): unknown endpoint "toString"',
    ],
    [{ type: "async", endpoint: "" }, 'Field "customer" (async): endpoint must be a key'],
    [{ type: "async", endpoint: 5 }, 'Field "customer" (async): endpoint must be a key'],
    [
      { type: "async", endpoint: ["customers"] },
      'Field "customer" (async): endpoint must be a key',
    ],
    [{ type: "async" }, 'Field "customer" (async): endpoint must be a key'],
  ])
    assert.throws(() => bound({ fields: { title: field.text(), customer } }), { message });
});

test("params can only be declared on async fields in both versions of defineForm", () => {
  const { defineForm: bound, field: fields } = createForms({ endpoints: [sales()] });
  for (const [note, type] of [
    [fields.text(), "text"],
    [fields.number(), "number"],
    [fields.checkbox(), "checkbox"],
    [fields.select({ options: [] }), "select"],
  ])
    for (const params of [() => ({}), undefined])
      for (const define of [bound, defineForm])
        assert.throws(() => define({ fields: { note }, rules: { note: { params } } }), {
          message: `Field "note" params: ${type} fields have no params`,
        });
  const contact = fields.async("contacts");
  for (const params of [5, { customer: 1 }, [() => ({})]])
    assert.throws(() => bound({ fields: { contact }, rules: { contact: { params } } }), {
      message: 'Field "contact" params: formula must be a function',
    });
  bound({ fields: { contact }, rules: { contact: { params: () => ({}) } } });
});
