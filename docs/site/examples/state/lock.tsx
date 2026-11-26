import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const order = defineForm({
  fields: {
    customer: field.text({ label: "Customer", default: "Atlas Trading" }),
    quantity: field.number({ label: "Quantity", default: 4 }),
    review: field.checkbox({ label: "Under review" }),
    comment: field.text({ label: "Internal comment" }),
    confirmed: field.checkbox({ label: "Order confirmed" }),
  },
  rules: {
    // The field's own rule still contributes even when the field is exempt from the lock.
    comment: { readOnly: ({ review }) => review && "Under review" },
  },
  // Confirming locks everything except the confirmation and the internal comment.
  form: {
    readOnly: [
      {
        value: ({ confirmed }) => confirmed && "Order confirmed",
        except: ["confirmed", "comment"],
      },
    ],
  },
});

export const Demo = () => {
  const editor = useFormSession(order);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="customer" />
      <Field session={session} name="quantity" />
      <Field session={session} name="review" />
      <Field session={session} name="comment" />
      <Field session={session} name="confirmed" />
      <div className="actions">
        {/* The lock limits the view. The core accepts the write. */}
        <button type="button" onClick={() => session.edit("quantity", 10)}>
          {'session.edit("quantity", 10)'}
        </button>
      </div>
      <SessionState session={session} show={["values", "fieldStates"]} />
    </>
  );
};
