import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";

const shape = {
  customer: field.text(),
  quantity: field.number({ default: 2 }),
  price: field.number({ default: 5000 }),
  total: field.number(),
  includeNote: field.checkbox({ default: true }),
  confirmed: field.checkbox(),
  note: field.text({ default: "Leave at the front desk" }),
};

// The public example: rules come first and fields last, sections keep any order.
const order = defineForm({
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    note: { disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed] },
  },
  fields: shape,
});
const session = createSession(order);
const disabled: boolean = session.getSnapshot().fieldStates.note.disabled;
void disabled;
// @ts-expect-error Snapshot fields retain exact names.
void session.getSnapshot().fieldStates.missing;
// @ts-expect-error Checkbox states have no placeholder.
void session.getSnapshot().fieldStates.confirmed.placeholder;
// @ts-expect-error Snapshot state belongs to the session.
session.getSnapshot().fieldStates.note.disabled = false;
// Every renderer receives disabled next to its value.
const ui = createReactBinding({
  text: ({ value, disabled: off, onChange }) => {
    onChange(value);
    return <input aria-label="Note" value={value} disabled={off} />;
  },
  checkbox: ({ value, disabled: off, onChange }) => {
    onChange(value);
    return <input aria-label="Include" type="checkbox" readOnly checked={value} disabled={off} />;
  },
  number: ({ value, disabled: off }) => (
    <input aria-label="Amount" value={value ?? ""} disabled={off} />
  ),
  select: ({ disabled: off }) => <select aria-label="Status" disabled={off} />,
});
void (<ui.Field session={session} name="note" />);

// A single formula, formulas without arguments, peek, undefined results and the
// field's own value; value, disabled and onChange share an entry.
defineForm({
  fields: shape,
  rules: {
    note: { disabled: ({ confirmed }, { peek: { customer } }) => confirmed && customer === "" },
    confirmed: { disabled: () => false },
    includeNote: { disabled: [() => true, ({ confirmed }) => (confirmed ? undefined : false)] },
    customer: { disabled: ({ confirmed }) => (confirmed ? true : undefined) },
    total: {
      value: ({ quantity }) => quantity,
      disabled: ({ total }) => (total ?? 0) > 100_000,
      onChange: ({ total }) => ({ confirmed: total === 0 }),
    },
    quantity: { disabled: [] },
    price: { disabled: [(values) => values.confirmed, (_, { peek }) => peek.includeNote] as const },
  },
});
const reusedFormulas = [({ confirmed }: { readonly confirmed: boolean }) => confirmed];
const reusedEntry = { disabled: () => true };
defineForm({ fields: shape, rules: { note: { disabled: reusedFormulas }, total: reusedEntry } });

// Results are true, false or undefined.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error null is not a contribution.
    note: { disabled: () => null },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reason cannot be empty.
    note: { disabled: () => "" },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A number is not a contribution.
    note: { disabled: () => 1 },
  },
});
defineForm({
  fields: shape,
  rules: {
    /* oxlint-disable typescript/strict-boolean-expressions -- This fixture verifies a rejected result. */
    // @ts-expect-error A nullable number can leak through a logical and.
    note: { disabled: ({ quantity }) => quantity && quantity > 3 },
    /* oxlint-enable typescript/strict-boolean-expressions */
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error An element of the array keeps the result type.
    note: { disabled: [() => true, ({ quantity }) => quantity] },
  },
});
const reason = () => "" as const;
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused formula keeps the result type.
    note: { disabled: reason },
  },
});
const reasons = [() => true, () => 1];
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused array keeps the result type.
    note: { disabled: reasons },
  },
});

// Formulas are synchronous functions.
defineForm({
  fields: shape,
  rules: {
    note: {
      // @ts-expect-error Async formulas are rejected.
      disabled: async () => {
        await Promise.resolve();
        return true;
      },
    },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A union with a promise is asynchronous.
    note: { disabled: ({ confirmed }) => (confirmed ? true : Promise.resolve(false)) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error disabled takes a formula, not a value.
    note: { disabled: true },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Every element of the array is a formula.
    note: { disabled: [() => true, true] },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error An array has no empty contributions.
    note: { disabled: [() => true, undefined] },
  },
});

// Reads, helpers and properties are closed, also in reused objects.
defineForm({
  fields: shape,
  // @ts-expect-error Destructured reads name fields of the definition.
  rules: { note: { disabled: ({ confirmd }) => confirmd === true } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Peek reads name fields of the definition.
  rules: { note: { disabled: (_, { peek }) => peek.confirmd === true } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Formulas receive only peek as a helper.
  rules: { note: { disabled: (_, { toDefaults }) => toDefaults === undefined } },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Properties of a rule entry are closed.
    note: { disabeld: () => true },
  },
});
const misspelled = { disabled: () => true, disabeld: () => false };
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused entry cannot hide a misspelled property.
    note: misspelled,
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error clearWhen is not a supported rule property.
    note: { clearWhen: () => true },
  },
});
defineForm({
  fields: shape,
  rules: {
    note: {
      disabled: (values) => {
        // @ts-expect-error Values are readonly.
        values.note = "";
        return true;
      },
    },
  },
});
