import { defineForm, field, type Session } from "trama-forms/core";
import { useOutputs } from "trama-forms/react";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const invoice = defineForm({
  fields: {
    quantity: field.number({ label: "Quantity", default: 3 }),
    price: field.number({ label: "Unit price", default: 1000 }),
    hasDiscount: field.checkbox({ label: "10% discount" }),
  },
  outputs: ({ output }) => {
    // The fields are destructured. read reads another output from the same definition.
    const subtotal = output(({ quantity, price }) => (quantity ?? 0) * (price ?? 0));
    const discount = output(({ hasDiscount }, { read }) =>
      hasDiscount ? Math.round(read(subtotal) * 0.1) : 0,
    );
    const tax = output((_, { read }) => Math.round((read(subtotal) - read(discount)) * 0.2));
    const total = output((_, { read }) => read(subtotal) - read(discount) + read(tax));
    return { subtotal, discount, tax, total };
  },
});

const money = (amount: number) => `${amount} JPY`;

const Summary = ({ session }: { session: Session<typeof invoice> }) => {
  // Names and types are inferred from outputs.
  const { subtotal, discount, tax, total } = useOutputs(session);
  return (
    <dl className="summary">
      <dt>Subtotal</dt>
      <dd>{money(subtotal)}</dd>
      <dt>Discount</dt>
      <dd>−{money(discount)}</dd>
      <dt>Tax (20%)</dt>
      <dd>{money(tax)}</dd>
      <dt>Total</dt>
      <dd>
        <strong>{money(total)}</strong>
      </dd>
    </dl>
  );
};

export const Demo = () => {
  const editor = useFormSession(invoice);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="row">
        <Field session={session} name="quantity" />
        <Field session={session} name="price" />
      </div>
      <Field session={session} name="hasDiscount" />
      <Summary session={session} />
      {/* Outputs are separate from values. */}
      <SessionState session={session} />
    </>
  );
};
