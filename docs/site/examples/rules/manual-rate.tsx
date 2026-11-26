import type { Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const order = defineForm({
  fields: {
    date: field.select({
      label: "Date",
      options: [
        { value: "2026-11-23", label: "November 23" },
        { value: "2026-11-24", label: "November 24" },
      ],
      default: "2026-11-23",
    }),
  },
  collections: {
    lines: {
      fields: {
        currency: field.select({
          label: "Currency",
          options: [
            { value: "USD", label: "USD" },
            { value: "EUR", label: "EUR" },
          ],
        }),
        rate: field.number({ label: "Rate" }),
        rateManual: field.checkbox({ label: "Manual rate" }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        currency: { onChange: () => ({ rateManual: false }) },
        rate: {
          onEdit: () => ({ rateManual: true }),
          query: {
            // Simulated endpoint.
            endpoint: "exchangeRate",
            params: ({ currency, rateManual }, { values: { date } }) =>
              rateManual || currency === null || date === null ? undefined : { currency, date },
          },
        },
      },
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(order, {
    scope: "simulated-rate",
    initial: { lines: [{ currency: "USD" }] },
  });
  if (editor.status !== "ready") return null;
  return <LineEditor session={editor.session} />;
};

const LineEditor = ({ session }: { session: Session<typeof order> }) => {
  const [key] = useRows(session, "lines");
  if (key === undefined) return null;
  const line = session.row("lines", key);

  return (
    <>
      <Field session={session} name="date" />
      <Field row={line} name="currency" />
      <Field row={line} name="rate" />
      <Field row={line} name="rateManual" />
      <SessionState session={session} />
    </>
  );
};
