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

// The fields of a line, new on every call so no test shares the author's objects.
const lineFields = () => ({
  quantity: field.number({ default: 1 }),
  price: field.number(),
  lot: field.text(),
});
const collections = () => ({
  lines: { fields: lineFields() },
  taxes: { fields: { rate: field.number() } },
});
// A form with a header field, lines and taxes, and the sections given.
const order = (config = {}) =>
  defineForm({ fields: { notes: field.text() }, collections: collections(), ...config });
const fails = (define, message) => assert.throws(define, { message });
const failsWith = (config, message) => fails(() => order(config), message);
const lock = (except) => ({ readOnly: { value: () => false, except } });
// Defines a form whose only collection is the entry given.
const declare = (entry) => () => defineForm({ fields: {}, collections: { lines: entry } });

test("The collections section is an object keyed by collection name", () => {
  for (const declared of [5, "lines", null, [], [{ fields: {} }], () => ({}), true])
    fails(
      () => defineForm({ fields: {}, collections: declared }),
      "Form collections must be an object keyed by collection",
    );
});

test("Each collection must be declared with { fields } and no other properties", () => {
  for (const entry of [5, "fields", null, [], [lineFields()], () => ({})])
    fails(declare(entry), 'Collection "lines": expected { fields }');
  // A field definition is not a collection: its type is an unknown property.
  fails(declare(field.number()), 'Collection "lines": unknown property "type"');
  fails(declare({ fields: lineFields(), x: 1 }), 'Collection "lines": unknown property "x"');
  fails(
    declare({ fields: lineFields(), lots: { fields: {} } }),
    'Collection "lines": unknown property "lots"',
  );
  for (const entry of [{}, { fields: undefined }])
    fails(declare(entry), 'Collection "lines" must declare fields');
  fails(declare({ fields: 3 }), 'Collection "lines": fields must be an object');
  fails(declare({ fields: { lot: 5 } }), 'Field "lot" of "lines" must be a field definition');
});

test("The same name cannot be declared in both fields and collections", () => {
  fails(
    () => defineForm({ fields: { notes: field.text() }, collections: { notes: { fields: {} } } }),
    'Name "notes" is declared in fields and collections',
  );
  // A field of a row may share its name with a header field.
  const definition = defineForm({
    fields: { notes: field.text() },
    collections: { lines: { fields: { notes: field.text() } } },
  });
  assert.deepEqual(Object.keys(definition.collections.lines.fields), ["notes"]);
});

test("Collection and row field names that JavaScript orders as indices are rejected", () => {
  for (const name of ["0", "7", "4294967294"])
    fails(
      () => defineForm({ fields: {}, collections: { [name]: { fields: {} } } }),
      `Collection "${name}": names that JavaScript orders as indices are not allowed`,
    );
  fails(
    () => defineForm({ fields: {}, collections: { lines: { fields: { 1: field.text() } } } }),
    'Field "1" of "lines": names that JavaScript orders as indices are not allowed',
  );
  // Names that look like numbers but are not indices keep their declaration order.
  const definition = defineForm({
    fields: {},
    collections: {
      b: { fields: {} },
      "01": { fields: {} },
      "-1": { fields: { 1.5: field.text() } },
    },
  });
  assert.deepEqual(Object.keys(definition.collections), ["b", "01", "-1"]);
});

test("A collection supports async fields only with the defineForm from createForms", () => {
  const sales = defineEndpoints({
    products: endpoint.options(() => Promise.resolve({ options: [], more: false })),
  });
  const forms = createForms({ endpoints: [sales] });
  const definition = forms.defineForm({
    fields: { customer: forms.field.async("products") },
    collections: { lines: { fields: { product: forms.field.async("products") } } },
  });
  assert.equal(definition.collections.lines.fields.product.type, "async");
  fails(
    declare({ fields: { product: { type: "async", endpoint: "products" } } }),
    'Field "product" of "lines" (async): define the form with the defineForm of createForms',
  );
});

test("rules.<collection> accepts each as an object keyed by field, plus row and collection", () => {
  for (const [rules, property] of [
    [{ x: 1 }, "x"],
    [{ value: () => [] }, "value"],
    [{ each: {}, disabled: () => true }, "disabled"],
  ])
    failsWith(
      { rules: { lines: rules } },
      `Rules of collection "lines": unknown property "${property}"`,
    );
  for (const rules of [5, [], () => ({})])
    failsWith(
      { rules: { lines: rules } },
      'Rules of collection "lines": expected an object with each, row or collection',
    );
  for (const each of [5, [], () => ({})])
    failsWith(
      { rules: { lines: { each } } },
      'Rules of collection "lines" each: expected an object keyed by field',
    );
  // An entry or an each left undefined declares nothing.
  for (const rules of [undefined, {}, { each: undefined }, { each: {} }])
    assert.deepEqual(createSession(order({ rules: { lines: rules } })).getSnapshot().rows, {
      lines: [],
      taxes: [],
    });
});

test("each names only fields from its own collection", () => {
  // notes is a header field, rate a field of taxes, toString an inherited name.
  for (const name of ["amout", "notes", "rate", "toString"])
    failsWith(
      { rules: { lines: { each: { [name]: { value: () => 1 } } } } },
      `Rules of collection "lines" each: unknown field "${name}"`,
    );
  failsWith(
    { rules: { lines: { each: { price: { foo: () => 1 } } } } },
    'Field "price" of "lines" rules: unknown property "foo"',
  );
});

test("The core rejects query in each as it does in the header, and params exists only on async fields", () => {
  for (const query of [{ endpoint: "prices", patch: () => ({}) }, () => ({})])
    failsWith(
      { rules: { lines: { each: { price: { query } } } } },
      'Field "price" of "lines" query: define the form with the defineForm of createForms',
    );
  for (const [name, type] of [
    ["price", "number"],
    ["lot", "text"],
  ])
    failsWith(
      { rules: { lines: { each: { [name]: { params: () => ({}) } } } } },
      `Field "${name}" of "lines" params: ${type} fields have no params`,
    );
});

test("except names row fields from declared collections", () => {
  failsWith(
    { form: lock(["notes", { lines: ["nots"] }]) },
    'Form readOnly: unknown field "nots" of collection "lines" in except',
  );
  // A field of another collection or of the header is unknown in this one.
  failsWith(
    { form: lock([{ lines: ["rate"] }]) },
    'Form readOnly: unknown field "rate" of collection "lines" in except',
  );
  failsWith(
    { form: lock([{ lines: ["notes"] }]) },
    'Form readOnly: unknown field "notes" of collection "lines" in except',
  );
  failsWith(
    { form: lock([{ line: ["lot"] }]) },
    'Form readOnly: unknown collection "line" in except',
  );
  failsWith(
    {
      form: {
        readOnly: [{ value: () => false }, { value: () => false, except: [{ line: ["lot"] }] }],
      },
    },
    'Form readOnly[1]: unknown collection "line" in except',
  );
  // A collection is not a field of the header.
  failsWith({ form: lock(["lines"]) }, 'Form readOnly: unknown field "lines" in except');
  failsWith(
    { form: lock([{ lines: "lot" }]) },
    'Form readOnly: except of collection "lines" must be an array of fields',
  );
  const definition = order({ form: lock(["notes", { lines: ["lot"], taxes: [] }]) });
  assert.deepEqual(createSession(definition).getSnapshot().rows, { lines: [], taxes: [] });
});

test("definition.collections is a frozen copy independent of the author's object", () => {
  const declared = { lines: { fields: lineFields() } };
  const definition = defineForm({ fields: { notes: field.text() }, collections: declared });
  const { collections: copy } = definition;
  assert.deepEqual(copy, {
    lines: {
      fields: {
        quantity: { type: "number", default: 1 },
        price: { type: "number" },
        lot: { type: "text" },
      },
    },
  });
  for (const object of [copy, copy.lines, copy.lines.fields, ...Object.values(copy.lines.fields)])
    assert.ok(Object.isFrozen(object));
  assert.notEqual(copy, declared);
  assert.notEqual(copy.lines, declared.lines);
  assert.notEqual(copy.lines.fields, declared.lines.fields);
  assert.notEqual(copy.lines.fields.quantity, declared.lines.fields.quantity);
  // Later changes to the author's objects reach neither the definition nor its sessions.
  declared.lines.fields.quantity.default = 5;
  declared.lines.fields.extra = field.text();
  declared.taxes = { fields: {} };
  delete declared.lines.fields.lot;
  assert.deepEqual(Object.keys(copy), ["lines"]);
  assert.deepEqual(Object.keys(copy.lines.fields), ["quantity", "price", "lot"]);
  assert.equal(copy.lines.fields.quantity.default, 1);
  const session = createSession(definition, { initial: { lines: [{}] } });
  assert.deepEqual(session.getSnapshot().values.lines, [{ quantity: 1, price: null, lot: "" }]);
});

test("With collections omitted or empty, definition.collections is {} and the snapshot publishes rows: {}", () => {
  for (const config of [{}, { collections: undefined }, { collections: {} }]) {
    const definition = defineForm({ fields: { notes: field.text() }, ...config });
    assert.deepEqual(definition.collections, {});
    assert.ok(Object.isFrozen(definition.collections));
    const snapshot = createSession(definition).getSnapshot();
    assert.deepEqual(snapshot.rows, {});
    assert.deepEqual(snapshot.values, { notes: "" });
  }
});

test("A collection can declare empty fields, yielding empty row records", () => {
  const definition = defineForm({ fields: {}, collections: { marks: { fields: {} } } });
  assert.deepEqual(definition.collections, { marks: { fields: {} } });
  const session = createSession(definition, { initial: { marks: [{}, {}] } });
  const { values, fieldStates, rows } = session.getSnapshot();
  assert.deepEqual(values, { marks: [{}, {}] });
  assert.deepEqual(fieldStates, { marks: [{}, {}] });
  assert.equal(rows.marks.length, 2);
  assert.throws(() => createSession(definition, { initial: { marks: [{ x: 1 }] } }), {
    message: 'Collection "marks" initial[0]: unknown field "x"',
  });
});
