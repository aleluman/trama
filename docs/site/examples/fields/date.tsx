import { useState } from "react";
import { declareContext, defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

type ReportContext = { today: string };

// The period of a report. A date is YYYY-MM-DD text with no time or time zone, or null.
const period = defineForm({
  context: declareContext<ReportContext>(),
  // “To” defaults to today. “From” starts at null, its empty value.
  defaults: ({ today }) => ({ to: today }),
  fields: {
    from: field.date({ label: "From", placeholder: "No limit" }),
    to: field.date({ label: "To", placeholder: "No limit" }),
  },
});

// Today's date in the browser, as YYYY-MM-DD.
const localToday = () => new Date().toLocaleDateString("sv-SE");

export const Demo = () => {
  // Calculate today's date only when opening the session.
  const [context] = useState<ReportContext>(() => ({ today: localToday() }));
  const editor = useFormSession(period, { context });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="from" />
      <Field session={session} name="to" />
      <SessionState session={session} />
    </>
  );
};
