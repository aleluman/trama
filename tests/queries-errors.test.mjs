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
import { scriptedLoader } from "./helpers/scripted-loader.mjs";
import { rejects } from "./helpers/session.mjs";

// The diagnostics of a query's definition, of the value endpoints, of the
// params of a query and of retry. Sessions ask through the scripted loader, a
// mock that never settles a request here.
const scope = "acme";
const page = () => Promise.resolve({ options: [], more: false });
// A value, a full list and a paged endpoint.
const registry = () =>
  defineEndpoints({
    unitPrice: endpoint.value((_, { customer }) => Promise.resolve(1000 + 100 * customer)),
    contacts: endpoint.list(() => Promise.resolve([])),
    customers: endpoint.options(page),
  });
const ofPrice = (detail) => `Field "price" query: ${detail}`;
// An object with an own __proto__ key, as JSON.parse creates it.
const proto = (value) => JSON.parse(`{"__proto__": ${JSON.stringify(value)}}`);

test("trama-forms/core defineForm rejects any defined query regardless of shape or field type. query: undefined is equivalent to omitting it", () => {
  const message = ofPrice("define the form with the defineForm of createForms");
  const types = [field.number(), field.text(), field.checkbox(), field.select({ options: [] })];
  for (const price of types)
    for (const query of [{ endpoint: "unitPrice" }, {}, { x: 1 }, 5, null, "unitPrice"])
      assert.throws(() => defineForm({ fields: { price }, rules: { price: { query } } }), {
        message,
      });
  const bound = createForms({ endpoints: [registry()] });
  for (const [define, kind] of [
    [defineForm, field],
    [bound.defineForm, bound.field],
  ])
    define({ fields: { price: kind.number() }, rules: { price: { query: undefined } } });
});

test("The bound defineForm checks query in order: object, properties, endpoint, paged endpoint, params, patch, and forPrepare", () => {
  // rates is a key of another registry, which this defineForm does not know.
  createForms({ endpoints: [defineEndpoints({ rates: endpoint.value(page) })] });
  const { defineForm: bound, field: kind } = createForms({ endpoints: [registry()] });
  const shape = "expected an object with endpoint, params, patch and optional forPrepare";
  const paged = 'endpoint "customers" is paged; use a value or list endpoint';
  for (const [query, detail] of [
    [5, shape],
    [null, shape],
    ["unitPrice", shape],
    [[{ endpoint: "unitPrice" }], shape],
    [() => ({}), shape],
    [
      new (class Query {
        endpoint = "unitPrice";
      })(),
      shape,
    ],
    [{ endpoint: "unitPrice", x: 1 }, 'unknown property "x"'],
    [{ x: 1, endpoint: "nope", params: 5 }, 'unknown property "x"'],
    [{ endpoint: "nope" }, 'unknown endpoint "nope"'],
    [{ endpoint: "toString" }, 'unknown endpoint "toString"'],
    [{ endpoint: "rates" }, 'unknown endpoint "rates"'],
    [{ endpoint: 5 }, "unknown endpoint 5"],
    [{}, "unknown endpoint undefined"],
    [{ endpoint: "nope", params: 5 }, 'unknown endpoint "nope"'],
    [{ endpoint: "customers", params: 5 }, paged],
    [{ endpoint: "unitPrice", params: 5, patch: 5 }, "params must be a function"],
    [{ endpoint: "contacts", params: {} }, "params must be a function"],
    [{ endpoint: "unitPrice", patch: {} }, "patch must be a function"],
    [{ endpoint: "contacts", params: () => ({}), patch: "price" }, "patch must be a function"],
    [{ endpoint: "unitPrice", patch: 5, forPrepare: 1 }, "patch must be a function"],
    [{ endpoint: "unitPrice", forPrepare: 1 }, "forPrepare must be a boolean"],
    [{ endpoint: "contacts", forPrepare: "true" }, "forPrepare must be a boolean"],
    [{ endpoint: "contacts", forPrepare: null }, "forPrepare must be a boolean"],
  ])
    assert.throws(() => bound({ fields: { price: kind.number() }, rules: { price: { query } } }), {
      message: ofPrice(detail),
    });
  // Any field type takes a query, and params, patch and forPrepare may be omitted or undefined.
  for (const price of [kind.number(), kind.text(), kind.checkbox(), kind.async("contacts")])
    for (const query of [
      { endpoint: "unitPrice" },
      { endpoint: "contacts", params: undefined, patch: undefined, forPrepare: undefined },
      { endpoint: "unitPrice", forPrepare: true },
      { endpoint: "contacts", forPrepare: false },
    ])
      bound({ fields: { price }, rules: { price: { query } } });
});

test("endpoint.value requires a load function, and defineEndpoints accepts it and names all three constructors", () => {
  for (const load of [5, undefined, null, "load", { load: page }])
    assert.throws(() => endpoint.value(load), { message: "Endpoint: load must be a function" });
  defineEndpoints({ unitPrice: endpoint.value(page) });
  for (const value of [5, undefined, page, { load: page }, { kind: "value", load: page }])
    assert.throws(() => defineEndpoints({ unitPrice: endpoint.value(page), x: value }), {
      message:
        'Endpoint "x" must be created with endpoint.options, endpoint.list or endpoint.value',
    });
});

test("A value endpoint cannot serve an async field. The bound field.async and defineForm reject it", () => {
  const { defineForm: bound, field: kind } = createForms({ endpoints: [registry()] });
  assert.throws(() => kind.async("unitPrice"), {
    message: 'Endpoint "unitPrice" gives a value; use an options or list endpoint',
  });
  assert.throws(() => bound({ fields: { price: { type: "async", endpoint: "unitPrice" } } }), {
    message:
      'Field "price" (async): endpoint "unitPrice" gives a value; use an options or list endpoint',
  });
});

test("A session for a form with queries and no async fields requires a scope", () => {
  const { defineForm: bound, field: kind } = createForms({ endpoints: [registry()] });
  const definition = bound({
    fields: { price: kind.number() },
    rules: { price: { query: { endpoint: "unitPrice", params: () => {} } } },
  });
  // The plan requires it without fixing the text: only the subject is checked.
  for (const options of [undefined, {}, { scope: undefined }])
    assert.throws(() => createSession(definition, options), /requires a scope/u);
  createSession(definition, { scope });
});

// A form whose price is asked for with the given params; source feeds them.
const withParams = (params) => {
  const { defineForm: bound, field: kind } = createForms({ endpoints: [registry()] });
  const definition = bound({
    fields: { source: kind.number(), price: kind.number(), note: kind.text() },
    rules: { price: { query: { endpoint: "unitPrice", params } } },
  });
  const { loader, calls } = scriptedLoader();
  return { open: (initial) => createSession(definition, { scope, loader, initial }), calls };
};

test("A query params result other than a plain object or undefined rejects opening and editing with the query.params label", () => {
  const incompatible = [
    [null, "null"],
    [5, "5"],
    ["price", '"price"'],
    [[1], "[object Array]"],
    [Promise.resolve({}), "[object Promise]"],
  ];
  const results = incompatible.map(([result]) => result);
  const { open, calls } = withParams(({ source }) =>
    source === null ? undefined : results[source],
  );
  const session = open();
  for (const [index, [, shown]] of incompatible.entries()) {
    const message = `Field "price" query.params: incompatible result ${shown}, expected a plain object or undefined`;
    assert.throws(() => open({ source: index }), { message });
    rejects(session, () => session.edit("source", index), message);
  }
  assert.equal(calls.length, 0);
});

test("A query params failure rejects opening, editing, and reset with its cause", () => {
  const boom = new Error("No parameters");
  let broken = false;
  const { open, calls } = withParams(({ source }) => {
    if (broken || source === 1) throw boom;
    return { customer: 1 };
  });
  const message = 'Field "price" query.params: formula failed: No parameters';
  assert.throws(() => open({ source: 1 }), { message, cause: boom });
  const session = open({ price: 900 });
  rejects(session, () => session.edit("source", 1), message, boom);
  broken = true;
  rejects(session, () => session.reset(), message, boom);
  assert.equal(calls.length, 0);
});

test("Query params that are not plain data or have no canonical form reject the operation with their path", () => {
  for (const [result, detail] of [
    [{ since: new Date(0) }, 'result must be plain data: a Date at "since"'],
    [{ load() {} }, 'result must be plain data: a function at "load"'],
    [{ tags: [undefined] }, 'undefined is not allowed inside arrays at "tags[0]"'],
    [{ filter: proto(1) }, '"__proto__" is not allowed as a key at "filter"'],
    [{ filter: { constructor: null } }, '"constructor" is not allowed as a key at "filter"'],
  ]) {
    const { open } = withParams(({ source }) => (source === 1 ? result : { customer: 1 }));
    const session = open({ price: 900 });
    rejects(session, () => session.edit("source", 1), `Field "price" query.params: ${detail}`);
  }
});

test("retry throws for a field with no query or a missing field, including in a form with no queries", () => {
  const { open, calls } = withParams(({ source }) =>
    source === null ? undefined : { customer: source },
  );
  const session = open({ source: 1 });
  for (const name of ["note", "source", "nope", "toString", "__proto__"])
    rejects(session, () => session.retry(name), `Field "${name}" has no query`);
  const plain = createSession(defineForm({ fields: { title: field.text() } }));
  rejects(plain, () => plain.retry("title"), 'Field "title" has no query');
  assert.equal(calls.length, 1);
});

test("During a session notification, retry throws before checking the name and makes no request", () => {
  const { open, calls } = withParams(({ source }) =>
    source === null ? undefined : { customer: source },
  );
  const session = open({ source: 1 });
  const caught = [];
  session.subscribe(() => {
    for (const name of ["price", "note"]) {
      try {
        session.retry(name);
      } catch (error) {
        caught.push(error.message);
      }
    }
  });
  session.edit("note", "Other");
  const message = "Cannot retry a session during its notification";
  assert.deepEqual(caught, [message, message]);
  assert.deepEqual([calls.length, session.getSnapshot().queries.price.status], [1, "pending"]);
});
