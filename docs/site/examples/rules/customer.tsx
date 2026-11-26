import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// Data the application already has for each customer.
const customers = {
  atlas: { contact: "Bruno", terms: 45, country: "ES" },
  horizon: { contact: "Gloria", terms: 60, country: "MX" },
} as const;

const invoice = defineForm({
  fields: {
    customer: field.select({
      label: "Customer",
      options: [
        { value: "atlas", label: "Atlas Trading" },
        { value: "horizon", label: "Horizon Distribution" },
      ],
    }),
    contact: field.text({ label: "Contact" }),
    terms: field.number({ label: "Payment terms (days)", default: 30 }),
    country: field.select({
      label: "Country",
      options: [
        { value: "ES", label: "Spain" },
        { value: "MX", label: "Mexico" },
        { value: "JP", label: "Japan" },
      ],
      default: "JP",
    }),
  },
  rules: {
    // An event returns a patch that writes several fields at once. Without a customer,
    // toDefaults restores those fields to their default values.
    customer: {
      onChange: ({ customer }, { toDefaults }) =>
        customer === null ? toDefaults("contact", "terms", "country") : customers[customer],
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(invoice);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="customer" />
      <Field session={session} name="contact" />
      <Field session={session} name="terms" />
      <Field session={session} name="country" />
      <SessionState session={session} />
    </>
  );
};
