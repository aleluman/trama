import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  defineEndpoints,
  defineForm as defineCoreForm,
  defineRules as defineCoreRules,
  endpoint,
  field as coreField,
  subtype,
} from "trama-forms/core";

const catalog = defineEndpoints({
  people: endpoint.options(() => Promise.resolve({ options: [], more: false })),
  price: endpoint.value(() => Promise.resolve(1)),
});
const forms = createForms({
  endpoints: [catalog],
  subtypes: { textarea: subtype.text(), toggle: subtype.checkbox(), search: subtype.async() },
});
const other = createForms({ endpoints: [catalog], subtypes: { textarea: subtype.text() } });
const throwsMessage = (operation, message) => assert.throws(operation, { message });

test("createForms validates its subtypes after its endpoints", () => {
  const cases = [
    [{ endpoints: [catalog], subtypes: [] }, "createForms: subtypes must be an object of subtypes"],
    [
      { endpoints: [catalog], subtypes: { notes: { base: "text" } } },
      'Subtype "notes" must be created with subtype.<type>()',
    ],
    [
      { endpoints: [catalog], subtypes: { date: subtype.text() } },
      'Subtype "date" has the name of a field type',
    ],
    [
      { endpoints: [catalog], subtypes: { 1: subtype.text() } },
      'Subtype "1": names that JavaScript orders as indices are not allowed',
    ],
    [{ endpoints: [{}], subtypes: [] }, "createForms requires endpoints: an array of registries"],
    [
      { endpoints: [catalog], subtypes: {}, fields: {} },
      "createForms requires endpoints: an array of registries",
    ],
  ];
  for (const [config, message] of cases) throwsMessage(() => createForms(config), message);
});

test("a subtype factory validates the endpoint and then the presentation", () => {
  const cases = [
    [
      () => forms.field.textarea({ presentation: [] }),
      'Subtype "textarea": presentation must be an object',
    ],
    [
      () => forms.field.textarea({ presentation: { rows: () => 4 } }),
      'Subtype "textarea": presentation must be plain data: a function at "rows"',
    ],
    [() => forms.field.search("ghost", { presentation: [] }), 'Unknown endpoint "ghost"'],
    [
      () => forms.field.search("price"),
      'Endpoint "price" gives a value; use an options or list endpoint',
    ],
  ];
  for (const [operation, message] of cases) throwsMessage(operation, message);
});

test("a subtype field is accepted only by the forms and rule sets from its createForms", () => {
  const notes = forms.field.textarea();
  const lines = { lines: { fields: { notes } } };
  const cases = [
    [
      () => defineCoreForm({ fields: { notes } }),
      'Field "notes" (subtype "textarea"): define the form with the defineForm of createForms',
    ],
    [
      () => defineCoreRules({ fields: { notes }, rules: {} }),
      'Field "notes" (subtype "textarea"): define the rule set with the defineRules of createForms',
    ],
    [
      () => defineCoreForm({ fields: {}, collections: lines }),
      'Field "notes" of "lines" (subtype "textarea"): define the form with the defineForm of createForms',
    ],
    [
      () => other.defineForm({ fields: { notes } }),
      'Field "notes" (subtype "textarea") belongs to other forms',
    ],
    [
      () => other.defineForm({ fields: {}, collections: lines }),
      'Field "notes" of "lines" (subtype "textarea") belongs to other forms',
    ],
    [
      () => other.defineRules({ fields: { notes }, rules: {} }),
      'Field "notes" (subtype "textarea") belongs to other forms',
    ],
    [
      () => forms.defineForm({ fields: { notes: other.field.textarea() } }),
      'Field "notes" (subtype "textarea") belongs to other forms',
    ],
  ];
  for (const [operation, message] of cases) throwsMessage(operation, message);
});

test("a missing marker or an altered subtype field is rejected", () => {
  const notes = forms.field.textarea({ presentation: { rows: 2 } });
  const cases = [
    ["serialized", JSON.parse(JSON.stringify(notes)), '(subtype "textarea")'],
    ["handwritten", { type: "text", subtype: "textarea" }, '(subtype "textarea")'],
    ["with a different base", { ...forms.field.toggle(), type: "text" }, '(subtype "toggle")'],
    ["with a different name", { ...notes, subtype: "toggle" }, '(subtype "toggle")'],
    ["without a name", { ...forms.field.textarea(), subtype: undefined }, "(subtype undefined)"],
  ];
  for (const [name, item, label] of cases)
    throwsMessage(
      () => forms.defineForm({ fields: { notes: item } }),
      `Field "notes" ${label} belongs to other forms`,
      name,
    );
});

test("presentation requires a subtype, and a spread that changes it is copied at definition time", () => {
  throwsMessage(
    () => forms.defineForm({ fields: { notes: { ...coreField.text(), presentation: {} } } }),
    'Field "notes": presentation requires a subtype',
  );
  throwsMessage(
    () =>
      forms.defineForm({
        fields: { notes: { ...forms.field.textarea(), presentation: { at: new Date(0) } } },
      }),
    'Field "notes": presentation must be plain data: a Date at "at"',
  );
  const presentation = { rows: 3 };
  const form = forms.defineForm({
    fields: { notes: { ...forms.field.textarea(), presentation } },
  });
  presentation.rows = 9;
  assert.deepEqual(form.fields.notes.presentation, { rows: 3 });
  assert.equal(Object.isFrozen(form.fields.notes.presentation), true);
});

test("the first field with an error in the written order determines the diagnostic", () => {
  throwsMessage(
    () =>
      other.defineForm({
        fields: { a: coreField.text(), b: forms.field.toggle(), c: forms.field.textarea() },
      }),
    'Field "b" (subtype "toggle") belongs to other forms',
  );
});

test("a marker copied through reflection does not admit another subtype or expose forms", () => {
  const notes = forms.field.textarea();
  const [mark] = Object.getOwnPropertySymbols(notes);
  const token = notes[mark];
  assert.deepEqual(Object.keys(token), [], "The marker does not expose the endpoint table");
  assert.equal(Object.isFrozen(token), true);
  const forged = {
    ...notes,
    subtype: "neverDeclared",
    [mark]: { ...token, name: "neverDeclared" },
  };
  throwsMessage(
    () => forms.defineForm({ fields: { notes: forged } }),
    'Field "notes" (subtype "neverDeclared") belongs to other forms',
  );
  throwsMessage(
    () => forms.defineForm({ fields: { notes: { ...forms.field.toggle(), [mark]: token } } }),
    'Field "notes" (subtype "toggle") belongs to other forms',
  );
});
