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
      default: "JP",
    }),
    city: field.text({ label: "City" }),
    useCapital: field.checkbox({ label: "Fill with the capital" }),
  },
  rules: {
    // Runs only when country changes. The city returns to its default ("") or,
    // if requested, takes the capital of the new country.
    country: {
      onChange: ({ country, useCapital }, { toDefaults }) =>
        useCapital && country !== null ? { city: capitals[country] } : toDefaults("city"),
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
      <Field session={session} name="city" placeholder="Enter a city" />
      <Field session={session} name="useCapital" />
      <SessionState session={session} />
    </>
  );
};
