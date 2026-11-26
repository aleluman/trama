// External message fixtures used by package-submit.mjs.

// The response of a server translated into issues of a form, by the index of
// a line, with the keys of what was sent, which the declarations name without
// a path of the package.
export const rejected = `
import { createSession, defineForm, field, type Issue } from "trama-forms/core";
export const ledger = defineForm({
  fields: { date: field.date() },
  collections: { lines: { fields: { amount: field.number() } } },
});
export const ledgerSession = createSession(ledger, { initial: { lines: [{}] } });
export const sending = ledgerSession.prepare();
type Sent = Extract<Awaited<typeof sending>, { status: "ready" }>;
type Line = { readonly line: number; readonly message: string };
export const translate = (sent: Sent, lines: readonly Line[]) =>
  lines.map(({ line, message }) => ({
    collection: "lines" as const,
    key: sent.rows.lines[line],
    field: "amount" as const,
    message,
  }));
export const general = (message: string): Issue<typeof ledger>[] => [{ message }];
export const reject = (sent: Sent, lines: readonly Line[]) =>
  ledgerSession.setErrors("server", translate(sent, lines), { from: sent });
`;

// A module that rejects and warns through the emitted declarations.
export const rerejected = `
import type { Issue } from "trama-forms/core";
import { general, ledger, ledgerSession, reject, sending, translate } from "./declarations/rejected.js";
void sending.then((sent) => {
  if (sent.status !== "ready") return;
  const accepted: boolean = reject(sent, [{ line: 0, message: "x" }]);
  const issues: Issue<typeof ledger>[] = [...general("General"), ...translate(sent, [])];
  const warned: boolean = ledgerSession.setWarnings("server", issues, { from: sent });
  // @ts-expect-error A field of the header that does not exist.
  ledgerSession.setErrors("server", [{ field: "dat", message: "x" }]);
  // @ts-expect-error issue property "path" does not exist
  ledgerSession.setErrors("server", [{ message: "x", path: "a" }]);
  void [accepted, warned];
});
const external: readonly string[] = ledgerSession.getSnapshot().fieldStates.date.externalErrors;
const ofForm: readonly string[] = ledgerSession.getSnapshot().form.externalErrors;
void [external, ofForm];
`;
