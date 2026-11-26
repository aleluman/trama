import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const invoice = defineForm({
  fields: {
    customer: field.async("customers", { label: "Customer", placeholder: "Search for a customer" }),
  },
});

export const Demo = () => {
  const editor = useFormSession(invoice, { scope: "south-trading" });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  // Each Field for an async field creates its own option list. Its search and pages belong
  // to the view. Both views share the session's single value.
  return (
    <>
      <div className="columns">
        <Field session={session} name="customer" label="Customer (view A)" />
        <Field session={session} name="customer" label="Customer (view B)" />
      </div>
      <SessionState session={session} />
    </>
  );
};
