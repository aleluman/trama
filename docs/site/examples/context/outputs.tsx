import { useState } from "react";
import { declareContext, defineForm, field, type Session } from "trama-forms/core";
import { useOutputs } from "trama-forms/react";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

type Currency = { code: string; taxRate: number };

const quote = defineForm({
  context: declareContext<{ currency: Currency }>(),
  fields: {
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Unit price", default: 5000 }),
  },
  outputs: ({ output }) => {
    const net = output(({ quantity, price }) => (quantity ?? 0) * (price ?? 0));
    // The rate and code come from context, so the module needs no constant and the same
    // definition works for each company.
    const tax = output((_, { read, context }) => Math.round(read(net) * context.currency.taxRate));
    const caption = output(
      (_, { read, context }) => `Total: ${read(net) + read(tax)} ${context.currency.code}`,
    );
    return { net, tax, caption };
  },
});

// Simulated data for each company, as the application would provide it.
const companies = {
  south: { name: "South Trading", currency: { code: "JPY", taxRate: 0.2 } },
  horizon: { name: "Horizon Distribution", currency: { code: "EUR", taxRate: 0.15 } },
  compass: { name: "Compass Trading", currency: { code: "MXN", taxRate: 0.25 } },
} satisfies Record<string, { name: string; currency: Currency }>;
type Company = keyof typeof companies;
const ids: readonly Company[] = ["south", "horizon", "compass"];

const Caption = ({ session }: { session: Session<typeof quote> }) => {
  const { caption } = useOutputs(session);
  return <p className="big">{caption}</p>;
};

export const Demo = () => {
  const [company, setCompany] = useState<Company>("south");
  // A different company means different context, so the key also changes and another session opens.
  const editor = useFormSession(quote, {
    key: company,
    context: { currency: companies[company].currency },
  });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="actions">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={company === id}
            onClick={() => setCompany(id)}
          >
            {companies[id].name}
          </button>
        ))}
      </div>
      <div className="row">
        <Field session={session} name="quantity" />
        <Field session={session} name="price" />
      </div>
      <Caption session={session} />
      <SessionState session={session} show={["values", "outputs"]} />
    </>
  );
};
