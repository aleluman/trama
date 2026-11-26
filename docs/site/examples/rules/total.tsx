import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const line = defineForm({
  fields: {
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Price", default: 10 }),
    total: field.number({ label: "Total" }),
  },
  rules: {
    // Reads quantity and price, so a change to either recalculates total.
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
  },
});

export const Demo = () => {
  const editor = useFormSession(line);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="row">
        <Field session={session} name="quantity" />
        <Field session={session} name="price" />
        <Field session={session} name="total" />
      </div>
      <div className="actions">
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
      <SessionState session={session} />
    </>
  );
};
