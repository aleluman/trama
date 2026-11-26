import { createSession, defineForm, field } from "trama-forms/core";

// A report with a header only: a rule with an error and a warning, a formula
// and a warning of the form, for the external messages of its sources.
export const report = defineForm({
  fields: {
    since: field.date({ label: "From", required: true }),
    until: field.date({ label: "To" }),
    note: field.text(),
    quantity: field.number(),
    total: field.number(),
  },
  rules: {
    until: {
      error: ({ since, until }) =>
        since !== null && until !== null && since > until && "To is before From",
      warning: ({ until }) => until !== null && until > "2030-01-01" && "Too far away",
    },
    total: { value: ({ quantity }) => (quantity ?? 0) * 2 },
  },
  form: { warning: ({ note }) => note === "x" && "Test note" },
});
export const initial = { since: "2026-01-02", until: "2026-02-01", quantity: 1 };
export const open = (values = {}) => createSession(report, { initial: { ...initial, ...values } });
export const stateOf = (session, name) => session.getSnapshot().fieldStates[name];
export const external = (session, name) => stateOf(session, name).externalErrors;
// The counts of the form: destinations with an error, and with a warning.
export const counts = (session) => {
  const { form } = session.getSnapshot();
  return [form.errorCount, form.warningCount];
};
export { heard } from "./session.mjs";
