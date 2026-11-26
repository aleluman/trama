import { useSyncExternalStore } from "react";
import type { Session } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";
import { failNextQuote } from "./api.ts";

const quoted = defineForm({
  fields: {
    customer: field.select({
      label: "Customer",
      options: [
        { value: 1, label: "Atlas Trading" },
        { value: 2, label: "Prisma Trading" },
        { value: 3, label: "Compass Trading" },
      ],
    }),
    price: field.number({ label: "List price", default: 5000 }),
    discount: field.number({ label: "Discount (%)", default: 0 }),
    net: field.number({ label: "Final price" }),
  },
  rules: {
    // The quote returns two values. patch writes both in one operation, so the final price
    // is recalculated once.
    price: {
      query: {
        endpoint: "quote",
        params: ({ customer }) => (customer === null ? undefined : { customer }),
        patch: ({ price, discount }) => ({ price, discount }),
      },
    },
    net: {
      value: ({ price, discount }) => Math.round(((price ?? 0) * (100 - (discount ?? 0))) / 100),
    },
  },
});

// The query status comes from snapshot.queries. Show a message while it waits or,
// if it failed, the error and the retry button.
const QuoteStatus = ({ session }: { session: Session<typeof quoted> }) => {
  const { queries } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { status, error } = queries.price;
  if (status === "pending") return <output className="status">Fetching the quote…</output>;
  if (status === "idle") return null;
  return (
    <div role="alert" className="error">
      <p>{error?.message}</p>
      <button type="button" onClick={() => session.retry("price")}>
        Retry
      </button>
    </div>
  );
};

export const Demo = () => {
  const editor = useFormSession(quoted, { scope: "south-trading" });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="actions">
        <button type="button" className="quiet" onClick={failNextQuote}>
          Fail the next query
        </button>
      </div>
      <Field session={session} name="customer" />
      <div className="row">
        <Field session={session} name="price" />
        <Field session={session} name="discount" />
        <Field session={session} name="net" />
      </div>
      <QuoteStatus session={session} />
      <SessionState session={session} show={["values", "queries"]} />
    </>
  );
};
