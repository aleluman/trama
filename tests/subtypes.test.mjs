import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint, subtype } from "trama-forms/core";
import { opened, settle } from "./helpers/scripted-loader.mjs";

const people = [
  { value: 1, label: "Ada", credit: 100 },
  { value: 2, label: "Grace", credit: 50 },
];
const catalog = defineEndpoints({
  people: endpoint.options(() => Promise.resolve({ options: people, more: false })),
  families: endpoint.list(() => Promise.resolve([{ value: 1, label: "Beverages" }])),
});
// The subtypes of an application, declared once.
const forms = createForms({
  endpoints: [catalog],
  subtypes: {
    textarea: subtype.text(),
    toggle: subtype.checkbox(),
    combobox: subtype.select(),
    search: subtype.async(),
    chips: subtype.multiAsync(),
  },
});
const { field, defineForm, defineRules } = forms;
const currencies = [
  { value: "JPY", label: "Yen" },
  { value: "USD", label: "Dollar" },
];

test("a subtype creates a definition of its base with its name and presentation", () => {
  const notes = field.textarea({ label: "Notes", presentation: { rows: 4 } });
  assert.equal(notes.type, "text");
  assert.equal(notes.subtype, "textarea");
  assert.equal(notes.label, "Notes");
  assert.deepEqual(notes.presentation, { rows: 4 });
  assert.equal(Object.isFrozen(notes.presentation), true);
  const customer = field.search("people", { presentation: { columns: ["label", "credit"] } });
  assert.equal(customer.type, "async");
  assert.equal(customer.endpoint, "people");
  assert.equal(Object.isFrozen(customer.presentation.columns), true);
  assert.equal("presentation" in field.toggle(), false, "Without presentation there is no key");
  assert.equal(subtype.text().base, "text");
  assert.equal(Object.isFrozen(subtype.text()), true);
});

test("presentation is copied when the field is created, and later changes to the author's object do not reach it", () => {
  const presentation = { columns: ["label"] };
  const customer = field.search("people", { presentation });
  presentation.columns.push("credit");
  const form = defineForm({ fields: { customer } });
  assert.deepEqual(form.fields.customer.presentation, { columns: ["label"] });
  assert.equal(form.fields.customer.presentation, customer.presentation);
});

test("a subtype field retains the value, rules, and state of its base", () => {
  const form = defineForm({
    fields: {
      notes: field.textarea({ presentation: { rows: 4 } }),
      urgent: field.toggle({ label: "Urgent" }),
      currency: field.combobox({ options: currencies, default: "JPY" }),
      customer: field.search("people"),
    },
    rules: {
      notes: {
        value: ({ urgent }) => (urgent ? "Urgent" : undefined),
        placeholder: ({ currency }) => `In ${currency}`,
      },
      urgent: { disabled: ({ customer }) => (customer === null ? "No customer" : false) },
    },
  });
  const session = createSession(form, { scope: 1 });
  const before = session.getSnapshot();
  assert.deepEqual(before.values, { notes: "", urgent: false, currency: "JPY", customer: null });
  assert.equal(before.fieldStates.notes.placeholder, "In JPY");
  assert.deepEqual(before.fieldStates.urgent.reasons, ["No customer"]);
  session.edit("customer", people[0]);
  session.edit("urgent", true);
  session.edit("currency", "USD");
  const after = session.getSnapshot();
  assert.equal(after.values.notes, "Urgent");
  assert.equal(after.fieldStates.notes.placeholder, "In USD");
  assert.equal(after.fieldStates.urgent.disabled, false);
  assert.throws(() => session.edit("currency", "EUR"), {
    message: 'Field "currency" (select): incompatible value EUR',
  });
  assert.equal("presentation" in after.fieldStates.notes, false, "Presentation is not state");
});

test("a remote subtype lists options from its endpoint, like its base", async () => {
  const form = defineForm({
    fields: { customer: field.search("people"), families: field.chips("families") },
  });
  const session = createSession(form, { scope: 1 });
  const list = opened(session, "customer");
  await settle();
  assert.deepEqual(
    list.getSnapshot().options.map(({ label }) => label),
    ["Ada", "Grace"],
  );
  session.edit("families", [{ value: 1, label: "Beverages" }]);
  assert.deepEqual(session.getSnapshot().values.families, [{ value: 1, label: "Beverages" }]);
});

test("spreading a subtype field preserves its acceptance, including in rows", () => {
  const notes = field.textarea({ presentation: { rows: 2 } });
  const form = defineForm({
    fields: { notes: { ...notes, label: "Notes" } },
    collections: { lines: { fields: { done: { ...field.toggle(), default: true } } } },
  });
  assert.equal(form.fields.notes.label, "Notes");
  assert.equal(form.fields.notes.presentation, notes.presentation);
  const session = createSession(form, { initial: { lines: [{}] } });
  assert.deepEqual(session.getSnapshot().values.lines, [{ done: true }]);
  assert.equal(form.collections.lines.fields.done.subtype, "toggle");
});

test("a rule set that requires the base accepts the subtype, and one that declares the subtype accepts the base", () => {
  const labelled = defineRules({
    fields: { notes: field.text() },
    rules: { notes: { label: () => "Notes" } },
  });
  const urgent = defineRules({
    fields: { urgent: field.toggle() },
    rules: { urgent: { hidden: () => true } },
  });
  const form = defineForm({
    fields: { notes: field.textarea({ presentation: { rows: 3 } }), urgent: field.checkbox() },
    include: [labelled, urgent],
  });
  const { fieldStates } = createSession(form).getSnapshot();
  assert.equal(fieldStates.notes.label, "Notes");
  assert.equal(fieldStates.urgent.hidden, true);
  assert.deepEqual(
    form.fields.notes.presentation,
    { rows: 3 },
    "Presentation belongs to the receiving form",
  );
});

test("a descriptor shared by two createForms calls keeps ownership of their fields separate", () => {
  const textarea = subtype.text();
  const first = createForms({ endpoints: [], subtypes: { textarea } });
  const second = createForms({ endpoints: [], subtypes: { textarea } });
  first.defineForm({ fields: { notes: first.field.textarea() } });
  assert.throws(() => second.defineForm({ fields: { notes: first.field.textarea() } }), {
    message: 'Field "notes" (subtype "textarea") belongs to other forms',
  });
});

test("createForms without subtypes retains its field and accepts empty subtypes", () => {
  const plain = createForms({ endpoints: [catalog] });
  const empty = createForms({ endpoints: [catalog], subtypes: {} });
  assert.deepEqual(Object.keys(empty.field), Object.keys(plain.field));
  assert.equal(Object.isFrozen(forms.field), true);
  assert.deepEqual(Object.keys(forms.field).slice(-5), [
    "textarea",
    "toggle",
    "combobox",
    "search",
    "chips",
  ]);
});
