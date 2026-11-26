import type { Session } from "trama-forms/core";
import { createReactBinding, useRows } from "trama-forms/react";
import { defineForm, field } from "../../forms.ts";
import { Field, useFormSession, useFormState } from "../../ui/form-ui";
import { NumberInput, TextInput } from "../../ui/inputs";

// An order with a required customer and lines with a product and quantity.
const order = defineForm({
  fields: { customer: field.text({ label: "Customer", required: "Choose the customer" }) },
  collections: {
    lines: {
      fields: {
        product: field.text({ label: "Product", required: "Product is missing" }),
        quantity: field.number({ label: "Quantity", min: 1 }),
      },
    },
  },
  rules: {
    lines: { collection: { error: ({ lines }) => lines.length === 0 && "Add a line" } },
  },
});

// Another binding with the same renderers, which shows local errors only after an attempt.
// An application that uses two policies needs two bindings.
const afterAttempt = createReactBinding(
  { text: TextInput, number: NumberInput },
  { showErrors: "attempted" },
);

export const Demo = () => {
  const editor = useFormSession(order, { initial: { lines: [{ quantity: 1 }] } });
  if (editor.status !== "ready") return null;
  return <Order session={editor.session} />;
};

const Order = ({ session }: { session: Session<typeof order> }) => {
  const keys = useRows(session, "lines");
  const form = useFormState(session);
  const lines = useFormState(session, "lines");
  return (
    <>
      <div className="row">
        <section aria-label="On touch">
          <h4>On touch</h4>
          <Field session={session} name="customer" />
          {keys.map((key) => (
            <div className="row" key={key}>
              <Field row={session.row("lines", key)} name="product" />
              <Field row={session.row("lines", key)} name="quantity" />
            </div>
          ))}
        </section>
        <section aria-label="After an attempt">
          <h4>After an attempt</h4>
          <afterAttempt.Field session={session} name="customer" />
          {keys.map((key) => (
            <div className="row" key={key}>
              <afterAttempt.Field row={session.row("lines", key)} name="product" />
              <afterAttempt.Field row={session.row("lines", key)} name="quantity" />
            </div>
          ))}
        </section>
      </div>
      <div className="actions">
        <button type="button" onClick={() => void session.prepare()}>
          Prepare
        </button>
        <button type="button" onClick={() => session.add("lines", [{ quantity: 1 }])}>
          Add line
        </button>
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
      <div className="state-panel" aria-label="Order state">
        <p>
          {form.errorCount} {form.errorCount === 1 ? "error" : "errors"} ·{" "}
          {form.attempted ? "Attempted" : "No attempt"}
        </p>
        {lines.errors.length > 0 && <p className="errors">{lines.errors.join(" · ")}</p>}
      </div>
    </>
  );
};
