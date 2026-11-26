// Fixtures for prepare, commit, touch, pending input, and external messages.
// package-consumer.mjs combines them with the other package fixtures.
import { rejected, rerejected } from "./package-external.mjs";
import { reviewed, reviewedUi, viewed, viewedUi } from "./package-views.mjs";

// prepare and commit: a query forPrepare, the outcome of prepare and a save
// over a prepared, which the declarations name without a path of the package.
export const submitted = `
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
const server = defineEndpoints({
  rate: endpoint.value((_, { day }: { day: number }) => Promise.resolve(day * 10)),
});
export const saving = createForms({
  endpoints: [server],
  messages: { query: ({ label }) => "No " + (label ?? "data") },
});
export const invoice = saving.defineForm({
  fields: { day: saving.field.number({ default: 1 }), rate: saving.field.number(), number: saving.field.number() },
  collections: { lines: { fields: { amount: saving.field.number() } } },
  rules: {
    rate: { query: { endpoint: "rate", params: ({ day }) => (day === null ? undefined : { day }), forPrepare: true } },
  },
});
export const invoiceSession = createSession(invoice, { scope: "acme" });
export const preparing = invoiceSession.prepare();
type Ready = Extract<Awaited<typeof preparing>, { status: "ready" }>;
export const save = (prepared: Ready, number: number) => invoiceSession.commit(prepared, { number });
export const firstWarning = (outcome: Awaited<typeof preparing>) =>
  outcome.status === "ready" ? outcome.warnings[0] : undefined;
`;

// A module that saves and reads the problems from the declarations emitted
// for prepare and commit.
export const resubmitted = `
import type { Issue, Prepared } from "trama-forms/core";
import { firstWarning, invoice, invoiceSession, preparing, save } from "./declarations/submitted.js";
export const saveFirst = (prepared: Prepared<typeof invoice>) => save(prepared, 1);
void preparing.then((outcome) => {
  if (outcome.status === "ready") {
    const accepted: boolean = save(outcome, 7);
    const number: number | null = outcome.values.number;
    const warning: Issue | undefined = firstWarning(outcome);
    void [accepted, number, warning];
  } else if (outcome.status === "invalid") {
    const issues: readonly Issue[] = outcome.issues;
    void issues;
  }
});
const attempted: boolean = invoiceSession.getSnapshot().form.attempted;
const { values, rows } = invoiceSession.getSnapshot();
// @ts-expect-error A prepared has a mark that only prepare gives.
save({ status: "ready", values, rows, warnings: [] }, 1);
void attempted;
`;

// Modules that emit declarations and modules that compile against them.
export const submissionEmitted = {
  "submitted.ts": submitted,
  "viewed.ts": viewed,
  "viewed-ui.ts": viewedUi,
  "rejected.ts": rejected,
};
export const submissionReconsumed = {
  "resubmitted.ts": resubmitted,
  "reviewed.ts": reviewed,
  "reviewed-ui.tsx": reviewedUi,
  "rerejected.ts": rerejected,
};
