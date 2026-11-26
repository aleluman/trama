import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  declareContext,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
} from "trama-forms/core";
import { inventory } from "./helpers/rows-async.mjs";
import {
  defineForm,
  defineRules,
  field,
  header,
  lineFields,
  prices,
  sale,
  sets,
} from "./helpers/rule-sets.mjs";

// What a form must have to include a rule set: its registry, the fields and
// collections it requires, with their type and endpoint, and its context.
// Each element is checked in the order written, and the first error wins.

const included = (form, message) => assert.throws(form, { message });

test("A core rule set fits any form, while a createForms rule set fits only forms from its registry", () => {
  const core = coreRules({
    fields: { notes: coreField.text() },
    rules: { notes: { hidden: () => true } },
  });
  assert.doesNotThrow(() => defineForm({ ...sale, include: [core] }));
  assert.doesNotThrow(() => coreForm({ fields: { notes: coreField.text() }, include: [core] }));
  const bound = defineRules({ fields: { notes: field.text() }, rules: {} });
  included(
    () => coreForm({ fields: { notes: coreField.text() }, include: [false, bound] }),
    "Form include[1]: rule set of createForms: define the form with the defineForm of createForms",
  );
  // Two calls of createForms with the same registries are two registries.
  const other = createForms({ endpoints: [inventory, prices] });
  included(
    () => other.defineForm({ fields: { notes: other.field.text() }, include: [bound] }),
    "Form include[0]: rule set of another createForms",
  );
});

test("Required header fields must exist with their types", () => {
  const rate = coreRules({ fields: { rate: coreField.number() }, rules: {} });
  included(
    () => coreForm({ fields: { notes: coreField.text() }, include: [rate] }),
    'Form include[0]: rule set requires field "rate"',
  );
  included(
    () => coreForm({ fields: { rate: coreField.text() }, include: [rate] }),
    'Form include[0]: rule set requires field "rate" of type number, not text',
  );
  // A collection of that name is not a field.
  included(
    () => coreForm({ fields: {}, collections: { rate: { fields: {} } }, include: [rate] }),
    'Form include[0]: rule set requires field "rate"',
  );
});

test("An async field's endpoint also counts toward compatibility", () => {
  const product = defineRules({ fields: { product: field.async("products") }, rules: {} });
  included(
    () => defineForm({ fields: { product: field.async("lots") }, include: [product] }),
    'Form include[0]: rule set requires field "product" with endpoint "products", not "lots"',
  );
  included(
    () => defineForm({ fields: { product: field.text() }, include: [product] }),
    'Form include[0]: rule set requires field "product" of type async, not text',
  );
});

test("Required collections must exist with their row fields", () => {
  const amount = coreRules({
    collections: { lines: { fields: { amount: coreField.number() } } },
    rules: {},
  });
  included(
    () => coreForm({ fields: { lines: coreField.text() }, include: [amount] }),
    'Form include[0]: rule set requires collection "lines"',
  );
  included(
    () => coreForm({ fields: {}, collections: { lines: { fields: {} } }, include: [amount] }),
    'Form include[0]: rule set requires field "amount" of "lines"',
  );
  included(
    () =>
      coreForm({
        fields: {},
        collections: { lines: { fields: { amount: coreField.text() } } },
        include: [amount],
      }),
    'Form include[0]: rule set requires field "amount" of "lines" of type number, not text',
  );
  const lots = defineRules({
    collections: { lines: { fields: { lot: field.async("lots") } } },
    rules: {},
  });
  included(
    () =>
      defineForm({
        fields: {},
        collections: { lines: { fields: { lot: field.async("products") } } },
        include: [lots],
      }),
    'Form include[0]: rule set requires field "lot" of "lines" with endpoint "lots", not "products"',
  );
});

test("A requirement's label, default, options, and required flag do not count", () => {
  const set = coreRules({
    fields: {
      rate: coreField.number({ default: 5, label: "Another" }),
      kind: coreField.select({ options: [{ value: "a", label: "A" }] }),
      notes: coreField.text({ placeholder: "Note" }),
    },
    rules: {},
  });
  assert.doesNotThrow(() =>
    coreForm({
      fields: {
        notes: coreField.text(),
        kind: coreField.select({ options: [{ value: 1, label: "One" }] }),
        rate: coreField.number(),
        extra: coreField.checkbox(),
      },
      include: [set],
    }),
  );
});

test("A rule set with context requires the form to declare context, while a set without context fits any form", () => {
  const context = declareContext();
  const withContext = coreRules({ context, rules: {} });
  const without = coreRules({ rules: {} });
  included(
    () => coreForm({ fields: {}, include: [without, withContext] }),
    "Form include[1]: rule set requires a context",
  );
  assert.doesNotThrow(() => coreForm({ fields: {}, context, include: [without, withContext] }));
});

test("Each item is checked in written order and the first error wins", () => {
  const rate = coreRules({ fields: { rate: coreField.number() }, rules: {} });
  const context = coreRules({ context: declareContext(), rules: {} });
  const bound = defineRules({ rules: {} });
  // The first element with a defect decides, whatever the later ones have.
  included(
    () => coreForm({ fields: {}, include: [context, rate, 1] }),
    "Form include[0]: rule set requires a context",
  );
  // Within an element: what it is, whether it repeats, its registry, its
  // fields and then its context.
  const both = coreRules({
    fields: { rate: coreField.number() },
    context: declareContext(),
    rules: {},
  });
  included(
    () => coreForm({ fields: {}, include: [both] }),
    'Form include[0]: rule set requires field "rate"',
  );
  included(
    () => coreForm({ fields: { rate: coreField.number() }, include: [rate, rate, bound] }),
    "Form include[1]: repeats the rule set of include[0]",
  );
  // The header before the collections, each in the order it declares them.
  const rows = coreRules({
    fields: { b: coreField.number(), a: coreField.number() },
    collections: { lines: { fields: { x: coreField.number() } } },
    rules: {},
  });
  included(
    () => coreForm({ fields: { a: coreField.number() }, include: [rows] }),
    'Form include[0]: rule set requires field "b"',
  );
});

test("include is checked after the form sections and before its rules", () => {
  const missing = coreRules({ fields: { rate: coreField.number() }, rules: {} });
  included(
    () => coreForm({ fields: { note: 1 }, include: [missing] }),
    'Field "note" must be a field definition',
  );
  included(
    () => coreForm({ fields: {}, context: {}, include: [missing] }),
    "Form context must be declared with declareContext<T>()",
  );
  included(
    () => coreForm({ fields: {}, include: [missing], rules: { other: {} } }),
    'Form include[0]: rule set requires field "rate"',
  );
  included(
    () =>
      coreForm({ fields: { rate: coreField.number() }, include: [missing], rules: { other: {} } }),
    'Rules: unknown field "other"',
  );
});

test("A form with the full family includes every rule set in the family", () => {
  assert.doesNotThrow(() =>
    defineForm({
      fields: { ...header, extra: field.text() },
      collections: { lines: { fields: { ...lineFields, note: field.text() } } },
      include: [sets.lots, sets.pricing, sets.amounts, sets.totals],
    }),
  );
});
