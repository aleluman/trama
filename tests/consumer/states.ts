import { defineForm, field } from "trama-forms/core";

const shape = {
  delivery: field.select({
    options: [
      { value: "shipping", label: "Shipping" },
      { value: "pickup", label: "In-store pickup" },
    ],
    default: "shipping",
  }),
  country: field.select({ options: [{ value: "ES", label: "Spain" }], default: "ES" }),
  city: field.text({ label: "City" }),
  total: field.number(),
  useCapital: field.checkbox(),
};

// The public example, its own field, undefined destinations and properties,
// helpers and reused patches.
const pickup = { country: { hidden: true }, city: { hidden: true }, useCapital: { hidden: true } };
const labels = (on: boolean) => ({
  city: { label: on ? "Municipality" : undefined, placeholder: "e.g." },
});
defineForm({
  fields: shape,
  rules: {
    delivery: {
      states: ({ delivery }) =>
        delivery === "pickup"
          ? { country: { hidden: true }, city: { hidden: true }, useCapital: { hidden: true } }
          : { city: { required: true } },
    },
    city: {
      states: ({ city }, { peek }) =>
        city === "" ? { city: { readOnly: peek.delivery ?? true } } : undefined,
    },
    total: {
      states: ({ total }) => ({
        total: { disabled: total === 0 && "No total", label: undefined },
      }),
    },
    country: { states: ({ country }) => (country === null ? pickup : labels(true)) },
    useCapital: { states: () => ({ city: undefined, total: {} }) },
  },
});

// Destinations and properties are closed, also in helpers and reused patches.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Destinations name fields of the definition.
    delivery: { states: () => ({ citi: { hidden: true } }) },
  },
});
const misspelled = () => ({ city: { hidden: true }, citi: { hidden: true } });
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A helper cannot hide an unknown destination.
    delivery: { states: misspelled },
  },
});
const hiden = { city: { hiden: true } };
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused patch cannot hide an unknown property.
    delivery: { states: () => hiden },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Values are written by onChange, not by states.
    delivery: { states: () => ({ city: { value: "Madrid" } }) },
  },
});
const withValue = () => ({ city: { hidden: false, value: "Madrid" } });
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A helper cannot write a value through states.
    delivery: { states: withValue },
  },
});

// placeholder only reaches text and number destinations.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Checkbox destinations have no placeholder.
    delivery: { states: () => ({ useCapital: { placeholder: "Yes" } }) },
  },
});
const choicePlaceholder = () => ({ country: { placeholder: "Choose" } });
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Select destinations have no placeholder, also from a helper.
    delivery: { states: choicePlaceholder },
  },
});

// Every property keeps its domain.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error hidden is a boolean or undefined.
    delivery: { states: () => ({ city: { hidden: "Hidden" } }) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A label is a string or undefined.
    delivery: { states: ({ total }) => ({ city: { label: total } }) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reason cannot be empty.
    delivery: { states: () => ({ city: { readOnly: "" } }) },
  },
});
const emptyReason = () => ({ city: { disabled: "" as const } });
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A helper cannot return an empty reason.
    delivery: { states: emptyReason },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A destination is an object of properties.
    delivery: { states: () => ({ city: true }) },
  },
});

// A states patch is an object or undefined, returned synchronously.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error false is not a state patch.
    delivery: { states: ({ delivery }) => delivery === "pickup" && pickup },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A patch from a promise is asynchronous.
    delivery: { states: () => Promise.resolve(pickup) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error states takes one formula, not an array.
    delivery: { states: [() => pickup] },
  },
});

// Numeric and symbol keys are not fields or state properties either.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A numeric key is not a destination.
    delivery: { states: () => ({ city: { hidden: true }, 1: { hidden: true } }) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A numeric key is not a state property.
    delivery: { states: () => ({ city: { hidden: true, 1: true } }) },
  },
});
const extra = Symbol("extra");
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A symbol is not a destination.
    delivery: { states: () => ({ city: { hidden: true }, [extra]: { hidden: true } }) },
  },
});
