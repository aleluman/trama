import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// customers returns pages of 20 customers and searches on the server.
const invoice = defineForm({
  fields: {
    customer: field.async("customers", { label: "Customer", placeholder: "Search for a customer" }),
  },
});

// The scope separates each company's remote data and is part of the cache key.
const company = "south-trading";

export const Demo = () => {
  const editor = useFormSession(invoice, { scope: company });
  if (editor.status !== "ready") return null;
  return (
    <>
      <Field session={editor.session} name="customer" />
      <SessionState session={editor.session} />
    </>
  );
};
