import { defineForm, field } from "trama-forms/core";

const shape = {
  country: field.text(),
  city: field.text(),
  total: field.number(),
};
const enabled = Math.random() < 2;
const good = () => ({ city: "Madrid" });
const bad = () => ({ city: "Madrid", citi: "typo" });
const other = () => ({ citi: "typo" });

// Conditional and optional entries, and unions of valid handlers, compile.
const countryRules = { onChange: good };
defineForm({
  fields: shape,
  rules: {
    ...(enabled && { country: countryRules }),
    ...(enabled ? { total: { value: () => 1 } } : {}),
    city: { onChange: enabled ? good : () => ({ total: 0 }) },
  },
});
const optional: { readonly onChange?: typeof good } = countryRules;
defineForm({ fields: shape, rules: { country: optional } });

// Every member of a conditional or optional entry is checked.
const misspelled = { value: () => "ES", valeu: () => "MX" };
defineForm({
  fields: shape,
  // @ts-expect-error A conditional entry cannot hide a misspelled property.
  rules: { ...(enabled && { country: misspelled }) },
});
const unknownTarget = { onChange: bad };
defineForm({
  fields: shape,
  // @ts-expect-error A conditional entry cannot hide an unknown patch field.
  rules: { ...(enabled && { country: unknownTarget }) },
});
defineForm({
  fields: shape,
  // @ts-expect-error An entry from a ternary cannot hide an unknown patch field.
  rules: { total: {}, ...(enabled ? { country: unknownTarget } : {}) },
});
const optionalEvent: { readonly onChange?: typeof bad } = unknownTarget;
defineForm({
  fields: shape,
  // @ts-expect-error An optional event keeps its patch fields.
  rules: { country: optionalEvent },
});

// A valid handler does not absorb the message of another member of a union.
const pick = (on: boolean): typeof bad | typeof good => (on ? bad : good);
defineForm({
  fields: shape,
  // @ts-expect-error A helper that returns either handler keeps the union.
  rules: { country: { onChange: pick(enabled) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Branches that are not subtypes of each other keep the union.
  rules: { country: { onChange: enabled ? other : good } },
});

// The same holds for state properties, the destinations of states and the form section.
const hiddenTypo = { hiden: () => true };
defineForm({
  fields: shape,
  // @ts-expect-error A conditional entry cannot hide a misspelled state property.
  rules: { ...(enabled && { city: hiddenTypo }) },
});
const cityStates = { states: () => ({ citi: { hidden: true } }) };
defineForm({
  fields: shape,
  // @ts-expect-error A conditional entry cannot hide an unknown destination.
  rules: { ...(enabled && { country: cityStates }) },
});
const valid = () => ({ city: { hidden: true } });
const invalid = () => ({ city: { hidden: true, value: "Madrid" } });
const patches = (on: boolean): typeof invalid | typeof valid => (on ? invalid : valid);
defineForm({
  fields: shape,
  // @ts-expect-error A union of states formulas keeps the value of each member.
  rules: { country: { states: patches(enabled) } },
});
const emptyReason = () => "" as const;
const reasons = (on: boolean): typeof emptyReason | (() => boolean) =>
  on ? emptyReason : () => true;
defineForm({
  fields: shape,
  // @ts-expect-error A union of formulas keeps the empty reason of a member.
  rules: { city: { readOnly: reasons(enabled) } },
});
const lockTypo = { value: () => true, exept: ["city"] };
defineForm({
  fields: shape,
  // @ts-expect-error A conditional form section cannot hide a misspelled entry.
  form: { ...(enabled && { readOnly: [lockTypo] }) },
});
defineForm({
  fields: shape,
  // @ts-expect-error A conditional form section cannot hide an unknown property.
  form: { ...(enabled && { hidden: [] }) },
});
const optionalLock: { readonly readOnly?: typeof lockTypo } = { readOnly: lockTypo };
defineForm({
  fields: shape,
  // @ts-expect-error An optional lock keeps the properties of its entry.
  form: optionalLock,
});

// A helper may return a union of whole sections; each member is checked.
const validRules = { city: { hidden: () => true } };
const typoRules = { city: { hidden: () => true, hiden: () => true } };
const rulesFrom = (on: boolean): typeof validRules | typeof typoRules =>
  on ? typoRules : validRules;
defineForm({
  fields: shape,
  // @ts-expect-error A union of rules sections cannot hide a misspelled property.
  rules: rulesFrom(enabled),
});
const foreignRules = { city: { hidden: () => true }, missing: { hidden: () => true } };
const fieldsFrom = (on: boolean): typeof validRules | typeof foreignRules =>
  on ? foreignRules : validRules;
defineForm({
  fields: shape,
  // @ts-expect-error A union of rules sections cannot hide an unknown field.
  rules: fieldsFrom(enabled),
});
const validForm = { readOnly: { value: () => true } };
const hiddenForm = { readOnly: { value: () => true }, hidden: [] };
const formFrom = (on: boolean): typeof validForm | typeof hiddenForm =>
  on ? hiddenForm : validForm;
defineForm({
  fields: shape,
  // @ts-expect-error A union of form sections cannot hide another property.
  form: formFrom(enabled),
});
