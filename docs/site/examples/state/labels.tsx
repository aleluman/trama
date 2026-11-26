import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };

const address = defineForm({
  fields: {
    country: field.select({
      label: "Country",
      options: [
        { value: "ES", label: "Spain" },
        { value: "MX", label: "Mexico" },
        { value: "JP", label: "Japan" },
      ],
      default: "ES",
    }),
    city: field.text({ label: "City" }),
    compact: field.checkbox({ label: "Compact view" }),
    zip: field.text({ label: "Postal code", placeholder: "Optional" }),
  },
  rules: {
    // In Spain, the field asks for the municipality. undefined restores the definition's label.
    city: {
      label: ({ country }) => (country === "ES" ? "Municipality" : undefined),
      placeholder: ({ country }) => (country === null ? undefined : `E.g., ${capitals[country]}`),
    },
    // The value "" clears the label, and the placeholder takes its place.
    zip: {
      label: ({ compact }) => (compact ? "" : undefined),
      placeholder: ({ compact }) => (compact ? "Postal code (optional)" : undefined),
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(address);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="country" />
      <Field session={session} name="city" />
      <Field session={session} name="compact" />
      <Field session={session} name="zip" />
      <p className="state-title">Another view of city with its own label</p>
      <Field session={session} name="city" label="Shipping city" />
      <SessionState session={session} show={["fieldStates"]} />
    </>
  );
};
