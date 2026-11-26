import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const delivery = defineForm({
  fields: {
    customer: field.async("customers", { label: "Customer", placeholder: "Search for a customer" }),
    contact: field.async("contacts", { label: "Contact" }),
    note: field.text({ label: "Delivery note", placeholder: "No instructions" }),
  },
  rules: {
    // The customer option includes the customer's default contact, already an option from contacts.
    // Choosing the same customer again leaves the value unchanged, so the event does not run.
    customer: { onChange: ({ customer }) => ({ contact: customer?.defaultContact ?? null }) },
    contact: {
      params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
    },
    // A formula reads the metadata. Without a customer, the definition's placeholder returns.
    note: { placeholder: ({ customer }) => customer?.deliveryHint },
  },
});

export const Demo = () => {
  const editor = useFormSession(delivery, { scope: "south-trading" });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="customer" />
      <Field session={session} name="contact" />
      <Field session={session} name="note" />
      <SessionState session={session} />
    </>
  );
};
