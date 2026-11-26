import * as consumer from "./package-edits.mjs";

const relations = `
import { defineRules, field } from "trama-forms/core";

export const fields = {
  rate: field.number(),
  amount: field.number(),
  by: field.select({
    options: [{ value: "rate", label: "Rate" }, { value: "amount", label: "Amount" }],
  }),
};
export const collections = { lines: { fields } };
export const relations = defineRules({
  fields,
  collections,
  rules: {
    by: {
      relation: {
        default: "rate",
        members: { rate: ({ amount }) => amount, amount: ({ rate }) => rate },
      },
    },
    lines: {
      each: {
        by: {
          relation: {
            default: "rate",
            members: { rate: ({ amount }) => amount, amount: ({ rate }) => rate },
          },
        },
      },
    },
  },
});
`;

const reconsumedRelations = `
import { defineForm } from "trama-forms/core";
import { collections, fields, relations } from "./declarations/relations.js";

defineForm({ fields, collections, include: [relations] });
defineForm({
  fields,
  collections,
  // @ts-expect-error field "rate" value is declared in rules too
  include: [relations],
  rules: { rate: { value: () => 1 } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error field "amount" of "lines" onChange or onEdit is declared in rules too
  include: [relations],
  rules: { lines: { each: { amount: { onEdit: () => ({}) } } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error field "by" relation is declared by another rule set
  include: [relations, relations],
});
`;

export const emittedModules = { ...consumer.emittedModules, "relations.ts": relations };
export const reconsumedModules = {
  ...consumer.reconsumedModules,
  "reconsumed-relations.ts": reconsumedRelations,
};
