import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const visit = defineForm({
  fields: {
    customer: field.async("customers", { label: "Customer", placeholder: "Search for a customer" }),
    // contacts returns a customer's complete list, which is searched locally.
    contact: field.async("contacts", { label: "Contact" }),
  },
  rules: {
    // contacts requires { customer }. Without a customer, params returns undefined, so the
    // list is suspended and sends no request. Changing the customer changes params and reloads the list.
    contact: {
      params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(visit, { scope: "south-trading" });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="customer" />
      <Field session={session} name="contact" />
      <SessionState session={session} />
    </>
  );
};
