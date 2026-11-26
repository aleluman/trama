// What decimals and limits reject in types. Each negative fails for the reason
// its directive gives.
import {
  createSession,
  defineForm,
  defineRules,
  field,
  type DateDefinition,
  type NumberDefinition,
} from "trama-forms/core";

const fields = {
  note: field.text(),
  capped: field.checkbox(),
  price: field.number(),
  from: field.date(),
  to: field.date(),
};
const collections = { lines: { fields } };

// @ts-expect-error A definition takes no null: leaving the limit out is no limit.
field.number({ min: null });
// @ts-expect-error Nor does a date.
field.date({ max: null });
// @ts-expect-error A text field has no limits.
field.text({ min: 1 });
// @ts-expect-error A date has no decimals.
field.date({ decimals: 2 });
// @ts-expect-error A date limit is a text, not a number.
field.date({ min: 20260101 });
// @ts-expect-error decimals takes no null in a rule either.
defineForm({ fields, rules: { price: { decimals: () => null } } });
// @ts-expect-error A date limit takes a date or null.
defineForm({ fields, rules: { to: { min: () => 5 } } });
// @ts-expect-error A number limit takes a number or null.
defineForm({ fields, rules: { price: { max: ({ from }) => from } } });
// @ts-expect-error A date has no decimals.
defineForm({ fields, rules: { from: { decimals: () => 2 } } });
// @ts-expect-error A text has no min.
defineForm({ fields, rules: { note: { min: () => 1 } } });
// @ts-expect-error One formula per property, as label.
defineForm({ fields, rules: { price: { decimals: [() => 2] } } });
const reused = { min: () => 5 };
// @ts-expect-error A reused entry is checked where it is written.
defineForm({ fields, rules: { to: reused } });
defineForm({
  fields,
  collections,
  // @ts-expect-error In a row as well.
  rules: { lines: { each: { to: { min: () => 5 } } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error A text of a row has no max.
  rules: { lines: { each: { note: { max: () => 1 } } } },
});
// @ts-expect-error A rule set too.
defineRules({ fields, rules: { from: { decimals: () => 2 } } });
// @ts-expect-error A states patch gives limits only to fields that have them.
defineForm({ fields, rules: { capped: { states: () => ({ note: { min: 1 } }) } } });
// @ts-expect-error And of their type.
defineForm({ fields, rules: { capped: { states: () => ({ to: { min: 5 } }) } } });
// @ts-expect-error decimals takes no null in a patch.
defineForm({ fields, rules: { capped: { states: () => ({ price: { decimals: null } }) } } });

const states = createSession(defineForm({ fields })).getSnapshot().fieldStates;
// @ts-expect-error A text state has no limits.
void states.note.min;
// @ts-expect-error A date state has no decimals.
void states.from.decimals;
// @ts-expect-error A state is readonly.
states.price.min = 1;

// In a union of a number and a date, every member checks a limit.
declare const either: NumberDefinition | DateDefinition;
// @ts-expect-error A number fits the number, not the date.
defineForm({ fields: { target: either }, rules: { target: { min: () => 5 } } });
// @ts-expect-error The date has no decimals.
defineForm({ fields: { target: either }, rules: { target: { decimals: () => 2 } } });
