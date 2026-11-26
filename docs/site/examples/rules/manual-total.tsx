import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const order = defineForm({
  fields: {
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Unit price", default: 10 }),
    total: field.number({ label: "Total" }),
    totalManual: field.checkbox({ label: "Manual total" }),
  },
  rules: {
    total: {
      value: ({ totalManual, quantity, price }) =>
        totalManual ? undefined : (quantity ?? 0) * (price ?? 0),
      onEdit: () => ({ totalManual: true }),
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(order);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="quantity" />
      <Field session={session} name="price" />
      <Field session={session} name="total" />
      <Field session={session} name="totalManual" />
      <button type="button" onClick={() => session.edit("totalManual", false)}>
        Return to calculation
      </button>
      <SessionState session={session} />
    </>
  );
};
