import { useState } from "react";
import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

type Setup = { readonly discounts: boolean; readonly consult: boolean };

// One definition per application configuration. An optional property set to
// undefined is equivalent to omitting it.
const orderForm = ({ discounts, consult }: Setup) =>
  defineForm({
    fields: {
      customer: field.text({ label: "Customer" }),
      quantity: field.number({ label: "Quantity", default: 1 }),
      discount: field.number({
        label: "Discount (%)",
        // With discounts off, the field is hidden and its value is 0.
        default: discounts ? undefined : 0,
        hidden: discounts ? undefined : true,
      }),
    },
    rules: {
      discount: discounts
        ? { disabled: ({ customer }) => customer === "" && "Choose a customer" }
        : undefined,
    },
    form: { readOnly: consult ? { value: () => "View mode" } : undefined },
  });

const open = (setup: Setup) => ({ setup, definition: orderForm(setup) });

export const Demo = () => {
  const [{ setup, definition }, setOpened] = useState(() =>
    open({ discounts: false, consult: false }),
  );
  const toggle = (option: keyof Setup) => setOpened(open({ ...setup, [option]: !setup[option] }));
  // A different definition requires a different key, which opens another session.
  const editor = useFormSession(definition, { key: `${setup.discounts}:${setup.consult}` });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="actions">
        <button type="button" aria-pressed={setup.discounts} onClick={() => toggle("discounts")}>
          The company uses discounts
        </button>
        <button type="button" aria-pressed={setup.consult} onClick={() => toggle("consult")}>
          View mode
        </button>
      </div>
      <Field session={session} name="customer" />
      <Field session={session} name="quantity" />
      <Field session={session} name="discount" />
      <SessionState session={session} show={["values", "fieldStates"]} />
    </>
  );
};
