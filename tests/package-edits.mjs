import * as consumer from "./package-consumer.mjs";

const edits = `
import { defineRules, field } from "trama-forms/core";
export const fields = { debit: field.number(), credit: field.number() };
export const editing = defineRules({
  fields,
  rules: { debit: { onEdit: ({ debit }, { before }) => ({ credit: debit ?? before.credit }) } },
});
`;
const reconsumedEdits = `
import { defineForm, defineRules } from "trama-forms/core";
import { fields, editing } from "./declarations/edits.js";
defineForm({ fields, include: [editing] });
export const changing = defineRules({ fields, rules: { debit: { onChange: () => ({ credit: 0 }) } } });
defineForm({
  fields,
  // @ts-expect-error field "debit" onChange or onEdit is declared by another rule set
  include: [editing, changing],
});
`;

export const emittedModules = { ...consumer.emittedModules, "edits.ts": edits };
export const reconsumedModules = {
  ...consumer.reconsumedModules,
  "reconsumed-edits.ts": reconsumedEdits,
};
