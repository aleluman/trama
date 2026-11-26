import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const orderLine = defineForm({
  fields: {
    customer: field.select({
      label: "Customer",
      options: [
        { value: 1, label: "Atlas Trading" },
        { value: 2, label: "Prisma Trading" },
        { value: 3, label: "Compass Trading" },
      ],
    }),
    price: field.number({ label: "Unit price", default: 5000 }),
    quantity: field.number({ label: "Quantity", default: 2 }),
    total: field.number({ label: "Net total" }),
  },
  rules: {
    // listPrice takes 2.5 seconds. Without a customer, params returns undefined and the
    // query is suspended. Without patch, the response is written to price, the query entry.
    price: {
      query: {
        endpoint: "listPrice",
        params: ({ customer }) => (customer === null ? undefined : { customer }),
      },
    },
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
  },
});

export const Demo = () => {
  // A form with queries requires a scope, just like one with async fields.
  const editor = useFormSession(orderLine, { scope: "south-trading" });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="customer" />
      <div className="row">
        <Field session={session} name="price" />
        <Field session={session} name="quantity" />
        <Field session={session} name="total" />
      </div>
      <SessionState session={session} show={["values", "queries"]} />
    </>
  );
};
