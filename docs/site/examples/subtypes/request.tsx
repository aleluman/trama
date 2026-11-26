import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// A purchase request. Products are searched in a table, urgency is a switch, and notes
// are a text area. Each field keeps the value and rules of its base type.
const request = defineForm({
  fields: {
    product: field.search("products", {
      label: "Product",
      presentation: {
        columns: [
          { key: "value", title: "Code" },
          { key: "label", title: "Product" },
          { key: "unit", title: "Unit" },
        ],
      },
    }),
    urgent: field.toggle({ label: "Urgent" }),
    notes: field.textarea({ label: "Notes", presentation: { rows: 3 } }),
  },
  rules: {
    // The product option is the value, including its metadata, as in an async field.
    urgent: { disabled: ({ product }) => (product === null ? "Choose a product" : false) },
    notes: {
      placeholder: ({ product }) => (product === null ? undefined : `Quantity (${product.unit})`),
      value: ({ urgent }) => (urgent ? "Ship today" : undefined),
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(request, { scope: "central-warehouse" });
  if (editor.status !== "ready") return null;
  const { session } = editor;
  return (
    <>
      <Field session={session} name="product" />
      <Field session={session} name="urgent" />
      <Field session={session} name="notes" />
      <SessionState session={session} show={["values"]} />
    </>
  );
};
