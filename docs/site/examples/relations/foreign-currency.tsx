import { useSyncExternalStore } from "react";
import type { Session } from "trama-forms/core";
import { useOutputs, useRows } from "trama-forms/react";
import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const voucher = defineForm({
  fields: {
    date: field.select({
      label: "Date",
      options: [
        { value: "2026-11-23", label: "November 23" },
        { value: "2026-11-24", label: "November 24" },
      ],
      default: "2026-11-23",
    }),
    side: field.select({
      label: "Document type",
      options: [
        { value: "debit", label: "Debit" },
        { value: "credit", label: "Credit" },
      ],
      default: "debit",
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
        foreign: field.number({ label: "Foreign amount", default: 100 }),
        rate: field.number({ label: "Rate" }),
        local: field.number({ label: "Local amount (JPY)" }),
        driver: field.text(),
        debit: field.number(),
        credit: field.number(),
      },
    },
  },
  rules: {
    lines: {
      each: {
        currency: { onChange: () => ({ driver: "" }) },
        rate: {
          query: {
            // Simulated endpoint shared with the Events demo.
            endpoint: "exchangeRate",
            params: ({ currency, driver }, { values: { date } }) =>
              driver === "" && currency !== null && date !== null ? { currency, date } : undefined,
          },
        },
        driver: {
          relation: {
            default: "rate",
            members: {
              rate: ({ foreign, local }) =>
                foreign === null || foreign === 0 ? undefined : (local ?? 0) / foreign,
              local: ({ foreign, rate }) => Math.round((foreign ?? 0) * (rate ?? 0)),
            },
          },
        },
        debit: { value: ({ local }, { values }) => (values.side === "debit" ? (local ?? 0) : 0) },
        credit: { value: ({ local }, { values }) => (values.side === "credit" ? (local ?? 0) : 0) },
      },
    },
  },
  outputs: ({ output }) => ({
    totalDebit: output(({ lines }) => lines.reduce((sum, line) => sum + (line.debit ?? 0), 0)),
    totalCredit: output(({ lines }) => lines.reduce((sum, line) => sum + (line.credit ?? 0), 0)),
  }),
});

export const Demo = () => {
  const editor = useFormSession(voucher, {
    scope: "simulated-voucher",
    initial: { lines: [{ currency: "USD" }] },
  });
  if (editor.status !== "ready") return null;
  return <VoucherEditor session={editor.session} />;
};

const VoucherEditor = ({ session }: { session: Session<typeof voucher> }) => {
  const [key] = useRows(session, "lines");
  const line = key === undefined ? undefined : session.row("lines", key);
  const query = useSyncExternalStore(
    line?.subscribe ?? session.subscribe,
    () => line?.getSnapshot()?.queries.rate,
  );
  const { totalDebit, totalCredit } = useOutputs(session);
  if (line === undefined) return null;

  return (
    <>
      <div className="row">
        <Field session={session} name="date" />
        <Field session={session} name="side" />
      </div>
      <div className="row">
        <Field row={line} name="currency" />
        <Field row={line} name="foreign" />
      </div>
      <div className="row">
        <Field row={line} name="rate" />
        <Field row={line} name="local" />
      </div>
      <output>{query?.status === "pending" ? "Fetching the rate…" : "No query in flight"}</output>
      <dl className="summary">
        <dt>Total debit</dt>
        <dd>{totalDebit}</dd>
        <dt>Total credit</dt>
        <dd>{totalCredit}</dd>
      </dl>
      <SessionState session={session} />
    </>
  );
};
