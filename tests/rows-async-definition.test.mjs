import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm as coreForm, field as coreField } from "trama-forms/core";
import { defineForm, field, lineFields, lotParams, orderOf, scope } from "./helpers/rows-async.mjs";
import { rejects } from "./helpers/session.mjs";

const fails = (define, message) => assert.throws(define, { message });
// An async field as JavaScript may write it, without field.async.
const raw = (endpoint) => ({ type: "async", endpoint });
// A form whose lines have the fields given, with the rules given.
const lines = (fields, rules) => () =>
  defineForm({ fields: {}, collections: { lines: { fields } }, rules });

test("Rows support async fields from the registry as frozen copies of their definitions", () => {
  const declared = lineFields();
  const definition = defineForm({ fields: {}, collections: { lines: { fields: declared } } });
  const { product, lot } = definition.collections.lines.fields;
  assert.deepEqual(product, { type: "async", endpoint: "products" });
  assert.deepEqual(lot, { type: "async", endpoint: "lots" });
  assert.notEqual(product, declared.product);
  assert.ok(Object.isFrozen(product));
  // A session opens with every async field of a row empty.
  const session = createSession(definition, { scope, initial: { lines: [{}] } });
  assert.deepEqual(session.getSnapshot().values.lines, [
    { product: null, warehouse: "", lot: null, quantity: 1 },
  ]);
});

test("The core defineForm rejects an async row field and the bound defineForm rejects unknown endpoints and value endpoints", () => {
  fails(
    () =>
      coreForm({
        fields: { note: coreField.text() },
        collections: { lines: { fields: { product: { type: "async", endpoint: "products" } } } },
      }),
    'Field "product" of "lines" (async): define the form with the defineForm of createForms',
  );
  fails(
    lines({ product: raw("missing") }),
    'Field "product" of "lines" (async): unknown endpoint "missing"',
  );
  fails(
    lines({ product: raw("toString") }),
    'Field "product" of "lines" (async): unknown endpoint "toString"',
  );
  fails(
    lines({ price: raw("unitPrice") }),
    'Field "price" of "lines" (async): endpoint "unitPrice" gives a value; use an options or list endpoint',
  );
  // The definition of the field is checked before its endpoint.
  fails(lines({ product: raw("") }), 'Field "product" of "lines" (async): endpoint must be a key');
  // The header resolves its endpoints before the collections.
  fails(
    () =>
      defineForm({
        fields: { customer: raw("nope") },
        collections: { lines: { fields: { product: raw("missing") } } },
      }),
    'Field "customer" (async): unknown endpoint "nope"',
  );
});

test("each.<field>.params exists only on async row fields and is a function", () => {
  for (const [name, type] of [
    ["warehouse", "text"],
    ["quantity", "number"],
  ])
    fails(
      lines(lineFields(), { lines: { each: { [name]: { params: () => ({}) } } } }),
      `Field "${name}" of "lines" params: ${type} fields have no params`,
    );
  for (const params of [5, "lot", {}, [() => ({})]])
    fails(
      lines(lineFields(), { lines: { each: { lot: { params } } } }),
      'Field "lot" of "lines" params: formula must be a function',
    );
  // params left undefined declares none.
  lines(lineFields(), { lines: { each: { lot: { params: undefined } } } })();
});

test("each supports query on any row field with its template label", () => {
  lines(lineFields(), { lines: { each: { quantity: { query: { endpoint: "unitPrice" } } } } })();
  fails(
    lines(lineFields(), { lines: { each: { quantity: { query: () => ({}) } } } }),
    'Field "quantity" of "lines" query: expected an object with endpoint, params, patch and optional forPrepare',
  );
});

test("A session with async fields only in rows requires a scope", () => {
  const definition = orderOf();
  for (const options of [undefined, {}, { initial: { lines: [{}] } }])
    fails(() => createSession(definition, options), "Form with async fields requires a scope");
  createSession(definition, { scope });
});

test("session.list gives header fields priority and rejects row fields with a diagnostic pointing to the handle in the first matching collection", () => {
  const definition = defineForm({
    fields: { product: field.async("products") },
    collections: {
      lines: { fields: lineFields() },
      returns: { fields: { lot: field.async("lots"), quantity: field.number() } },
    },
    rules: { lines: { each: { lot: { params: lotParams } } } },
  });
  const session = createSession(definition, { scope });
  assert.equal(session.list("product").getSnapshot().status, "idle");
  for (const [name, collection] of [
    ["lot", "lines"],
    ["warehouse", "lines"],
    ["quantity", "lines"],
  ])
    rejects(
      session,
      () => session.list(name),
      `Field "${name}" belongs to the rows of "${collection}": use session.row("${collection}", key).list("${name}")`,
    );
  rejects(session, () => session.list("lines"), 'Unknown field "lines"');
  rejects(session, () => session.list("nope"), 'Unknown field "nope"');
});

// The params of lot fail in the warehouse "broken", and return each result of
// results in the warehouse of its name.
const boom = new Error("No warehouse");
const results = { r0: 5, r1: "lot", r2: [1], r3: null, r4: { since: new Date(0) } };
const failing = orderOf({
  rules: {
    lines: {
      each: {
        lot: {
          params: ({ warehouse }) => {
            if (warehouse === "broken") throw boom;
            return Object.hasOwn(results, warehouse) ? results[warehouse] : { warehouse };
          },
        },
      },
    },
  },
});
const openFailing = (rows) => createSession(failing, { scope, initial: { lines: rows } });
const paramsLabel = (key) => `Field "lot" of "lines" row "${key}" params`;

test("A row params failure rejects both opening and the operation with its row label", () => {
  assert.throws(
    () => openFailing([{ warehouse: "a" }, { warehouse: "broken" }]),
    (error) => {
      assert.match(
        error.message,
        /^Field "lot" of "lines" row "r\d+" params: formula failed: No warehouse$/u,
      );
      assert.equal(error.cause, boom);
      return true;
    },
  );
  const session = openFailing([{ warehouse: "a" }]);
  const [key] = session.getSnapshot().rows.lines;
  const line = session.row("lines", key);
  const message = `${paramsLabel(key)}: formula failed: No warehouse`;
  rejects(session, () => line.edit("warehouse", "broken"), message, boom);
  // A failure in a row added later names that row.
  const [added] = session.add("lines", [{ warehouse: "b" }]);
  rejects(
    session,
    () => session.row("lines", added).edit("warehouse", "broken"),
    `${paramsLabel(added)}: formula failed: No warehouse`,
    boom,
  );
});

test("Row params that are not plain objects or lack canonical shape cause the operation to be rejected", () => {
  const session = openFailing([{ warehouse: "a" }]);
  const [key] = session.getSnapshot().rows.lines;
  const line = session.row("lines", key);
  for (const [warehouse, detail] of [
    ["r0", "incompatible result 5, expected a plain object or undefined"],
    ["r1", 'incompatible result "lot", expected a plain object or undefined'],
    ["r2", "incompatible result [object Array], expected a plain object or undefined"],
    ["r3", "incompatible result null, expected a plain object or undefined"],
    ["r4", 'result must be plain data: a Date at "since"'],
  ])
    rejects(session, () => line.edit("warehouse", warehouse), `${paramsLabel(key)}: ${detail}`);
});
