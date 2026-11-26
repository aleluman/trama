import { createSession, defineForm, field, type Session } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import type { CheckboxFieldProps, TextFieldProps } from "trama-forms/react";

const shape = {
  customer: field.text({ label: "Customer", required: true }),
  quantity: field.number({ default: 2, readOnly: "Fixed" }),
  confirmed: field.checkbox({ disabled: false, hidden: false }),
  country: field.select({
    options: [
      { value: "ES", label: "Spain" },
      { value: "MX", label: "Mexico" },
    ],
    default: "ES",
    readOnly: true,
    required: false,
  }),
  city: field.text({ label: "City" }),
  note: field.text(),
};

// Every state property of an entry: a formula or an array for the flags, one
// formula for label and placeholder, with reasons, undefined and peek.
const order = defineForm({
  fields: shape,
  rules: {
    note: {
      disabled: [({ confirmed }) => confirmed && "Order confirmed", () => false],
      readOnly: ({ customer }) => customer,
      hidden: [
        ({ confirmed }) => confirmed,
        ({ customer }) => (customer === "" ? true : undefined),
      ],
      required: (_, { peek }) => peek.confirmed,
      label: ({ confirmed }) => (confirmed ? "" : undefined),
      placeholder: ({ country }) => (country === "ES" ? "e.g., Madrid" : undefined),
    },
    city: {
      label: ({ country }) => (country === "ES" ? "Municipality" : undefined),
      readOnly: ({ country }) => (country === null ? true : undefined),
    },
    quantity: { placeholder: () => "0", required: [] },
    country: { label: ({ country }) => country ?? undefined },
  },
});

// fieldStates has exact, readonly keys per field type.
const states = createSession(order).getSnapshot().fieldStates;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Common = {
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly hidden: boolean;
  readonly required: boolean;
  readonly label: string | undefined;
  readonly reasons: readonly string[];
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly dirty: boolean;
  readonly touched: boolean;
};
type Flat<T> = { readonly [K in keyof T]: T[K] };
const text: Equal<
  typeof states.note,
  Flat<Common & { readonly placeholder: string | undefined }>
> = true;
const choice: Equal<typeof states.country, Common> = true;
const box: Equal<typeof states.confirmed, Common> = true;
void [text, choice, box];
// @ts-expect-error Checkbox states have no placeholder.
void states.confirmed.placeholder;
// @ts-expect-error Select states have no placeholder.
void states.country.placeholder;
// @ts-expect-error States keep the exact names of the fields.
void states.notes;
// @ts-expect-error A state is readonly.
states.note.readOnly = false;
// @ts-expect-error Reasons are readonly.
states.note.reasons[0] = "Other";
// @ts-expect-error The states are readonly.
states.note = states.city;

// State declared in the field: a flag or a reason for disabled and readOnly.
// @ts-expect-error hidden takes a boolean, not a reason.
field.text({ hidden: "Hidden" });
// @ts-expect-error required takes a boolean.
field.number({ required: 1 });
// @ts-expect-error readOnly takes a boolean or a reason.
field.checkbox({ readOnly: null });
// @ts-expect-error Checkbox fields have no placeholder.
field.checkbox({ placeholder: "Yes" });
// @ts-expect-error Select fields have no placeholder.
field.select({ options: [{ value: "a", label: "A" }], placeholder: "Choose" });
// @ts-expect-error Field state is not a formula.
field.text({ disabled: () => true });

// Results of each property.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reason cannot be empty.
    note: { readOnly: () => "" },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error An empty reason can leak through a logical and.
    note: { disabled: [({ customer }) => customer && "Reason"] },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error hidden takes no reason.
    note: { hidden: () => "Hidden" },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error required is a boolean or undefined.
    note: { required: [() => true, ({ quantity }) => quantity] },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A label is a string or undefined.
    note: { label: ({ quantity }) => quantity },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A label is not null.
    note: { label: () => null },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error label takes one formula, not an array.
    note: { label: [() => "Note"] },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A placeholder is a string or undefined.
    note: { placeholder: ({ confirmed }) => confirmed },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error readOnly keeps its result type in an array.
    note: { readOnly: [() => true, () => 1] },
  },
});
const emptyReason = () => "" as const;
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused formula keeps its empty reason.
    note: { readOnly: emptyReason },
  },
});

// placeholder exists only for text and number fields.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Checkbox fields have no placeholder.
    confirmed: { placeholder: () => "Yes" },
  },
});
const choicePlaceholder = { placeholder: () => "Choose" };
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused entry cannot give a select field a placeholder.
    country: choicePlaceholder,
  },
});

// Formulas of state are synchronous.
defineForm({
  fields: shape,
  rules: {
    note: {
      // @ts-expect-error Async formulas are rejected.
      hidden: async () => {
        await Promise.resolve();
        return true;
      },
    },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A label from a promise is asynchronous.
    note: { label: () => Promise.resolve("Note") },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reason from a promise is asynchronous.
    note: { readOnly: [({ confirmed }) => (confirmed ? "Yes" : Promise.resolve(false))] },
  },
});

// Properties, reads and helpers are closed.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error readonly is not readOnly.
    note: { readonly: () => true },
  },
});
const misspelled = { hidden: () => true, requried: () => true };
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused entry cannot hide a misspelled property.
    note: misspelled,
  },
});
defineForm({
  fields: shape,
  // @ts-expect-error Reads name fields of the definition.
  rules: { note: { hidden: ({ confirmd }) => confirmd === true } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Formulas of state receive only peek.
  rules: { note: { label: (_, { toDefaults }) => String(toDefaults) } },
});

// Renderers receive the state of their field.
const ui = createReactBinding({
  text: ({ label, placeholder, readOnly, required, reasons, value, onChange }: TextFieldProps) => {
    onChange(value);
    return (
      <label title={reasons.join(", ")}>
        {label}
        <input
          aria-required={required}
          readOnly={readOnly}
          placeholder={placeholder}
          value={value}
        />
      </label>
    );
  },
  checkbox: ({ readOnly, required, reasons, disabled }: CheckboxFieldProps) => (
    <input
      type="checkbox"
      aria-label={reasons[0] ?? "Checkbox"}
      aria-required={required}
      aria-readonly={readOnly}
      disabled={disabled}
    />
  ),
  number: ({ reasons }) => <output>{reasons.length}</output>,
  select: ({ readOnly }) => <select aria-label="Country" disabled={readOnly} />,
});
void (
  <ui.Field session={createSession(order)} name="city" label="Municipality" placeholder="e.g." />
);
const checkboxProps = (props: CheckboxFieldProps) => {
  // @ts-expect-error Checkbox renderers receive no placeholder.
  void props.placeholder;
  // @ts-expect-error Renderers cannot change the reasons.
  props.reasons[0] = "Other";
  return props.readOnly satisfies boolean;
};
void checkboxProps;
// @ts-expect-error A select field takes no placeholder in the view.
void (<ui.Field session={createSession(order)} name="country" placeholder="Choose" />);
// A generic wrapper over the definitions ui supports forwards the placeholder as Field types it.
type Supported = NonNullable<Parameters<typeof ui.Field>[0]["session"]>["definition"];
const Forward = <D extends Supported, K extends keyof D["fields"] & string>(props: {
  session: Session<D>;
  name: K;
  placeholder?: D["fields"][K]["type"] extends "text" | "number" | "async" | "date" | "multiAsync"
    ? string
    : never;
}) => <ui.Field {...props} />;
void (<Forward session={createSession(order)} name="city" placeholder="e.g." />);
// @ts-expect-error The wrapper keeps the rejection of a placeholder for a select.
void (<Forward session={createSession(order)} name="country" placeholder="Choose" />);
// Field renders an element of one renderer, whose value keeps the type of its field.
declare const rendered: NonNullable<ReturnType<typeof ui.Field>>;
void (rendered.props.value satisfies string | number | boolean | null);
