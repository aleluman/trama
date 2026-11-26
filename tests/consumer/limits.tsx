// Decimals and limits from the installed package: in the definition, in the
// rules, in a states patch and in rows; the state publishes them per field
// type, without null, and the renderers receive them.
import {
  createSession,
  defineForm,
  defineRules,
  field,
  type DateDefinition,
  type NumberDefinition,
} from "trama-forms/core";
import { createReactBinding, type DateFieldProps, type NumberFieldProps } from "trama-forms/react";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expect = <T extends true>() => undefined as unknown as T;

const fields = {
  currency: field.text(),
  capped: field.checkbox(),
  price: field.number({ decimals: 2, min: 0 }),
  discount: field.number({ max: 100 }),
  from: field.date({ min: "2026-01-01" }),
  to: field.date(),
};
export const order = defineForm({
  fields,
  collections: {
    lines: { fields: { free: field.checkbox(), amount: field.number({ min: 0 }) } },
  },
  rules: {
    price: { decimals: ({ currency }) => (currency === "USD" ? 2 : 0) },
    discount: { max: ({ capped }) => (capped ? 100 : null) },
    to: { min: ({ from }) => from, max: () => "2026-12-31" },
    capped: {
      states: ({ capped }) => ({
        discount: { min: capped ? 0 : null, decimals: undefined },
        from: { max: "2026-12-31" },
      }),
    },
    lines: {
      each: {
        amount: {
          decimals: (_, { values }) => (values.currency === "USD" ? 2 : 0),
          max: ({ free }) => (free ? 0 : null),
        },
      },
    },
  },
});
export const money = defineRules({
  fields,
  rules: { price: { decimals: () => 4 }, to: { max: ({ from }) => from } },
});

const states = createSession(order).getSnapshot().fieldStates;
// Exact, without null: an absent limit is an absent key.
expect<
  Equal<
    typeof states.price,
    {
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
      readonly placeholder: string | undefined;
      readonly decimals?: number;
      readonly min?: number;
      readonly max?: number;
    }
  >
>();
expect<
  Equal<
    typeof states.to,
    {
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
      readonly placeholder: string | undefined;
      readonly min?: string;
      readonly max?: string;
    }
  >
>();
expect<Equal<(typeof states.lines)[number]["amount"]["max"], number | undefined>>();

// A renderer receives each of them, or undefined.
const NumberInput = ({ value, decimals, min, max }: NumberFieldProps) => (
  <input type="number" value={value ?? ""} step={10 ** -(decimals ?? 2)} min={min} max={max} />
);
const DateInput = ({ value, min, max }: DateFieldProps) => (
  <input type="date" value={value ?? ""} min={min} max={max} readOnly />
);
expect<Equal<NumberFieldProps["decimals"], number | undefined>>();
expect<Equal<DateFieldProps["max"], string | undefined>>();
// A renderer that ignores them still fits.
const Plain = ({ value }: { readonly value: number | null }) => <output>{value}</output>;
export const ui = createReactBinding({ number: NumberInput, date: DateInput });
export const plain = createReactBinding({ number: Plain });

// A union of a number and a date takes what both take, null or undefined, in
// a formula, a patch and a union of sections; limits/errors rejects the rest.
declare const either: NumberDefinition | DateDefinition;
declare const sections: { target: NumberDefinition } | { target: DateDefinition };
export const unions = [
  defineForm({ fields: { target: either }, rules: { target: { min: () => null } } }),
  defineForm({
    fields: { target: either },
    rules: { target: { max: ({ target }) => (target === null ? undefined : null) } },
  }),
  defineForm({
    fields: { flag: field.checkbox(), target: either },
    rules: { flag: { states: () => ({ target: { min: null } }) } },
  }),
  defineForm({ fields: sections, rules: { target: { min: () => null } } }),
];
