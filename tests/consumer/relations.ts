import { createSession, declareContext, defineForm, defineRules, field } from "trama-forms/core";
import type { RowKey } from "trama-forms/core";

const options = [
  { value: "percent", label: "Percent" },
  { value: "amount", label: "Amount" },
] as const;
const fields = {
  gross: field.number(),
  percent: field.number(),
  amount: field.number(),
  discountBy: field.select({ options }),
};
const collections = { lines: { fields } };
const formContext = declareContext<{ readonly multiplier: number }>();
const ruleSet = defineRules({
  fields,
  collections,
  context: formContext,
  rules: {
    discountBy: {
      relation: {
        default: "percent",
        members: {
          percent: ({ amount }, { peek, context }) => {
            const by: "percent" | "amount" | null = peek.discountBy;
            void by;
            return (amount ?? 0) * context.multiplier;
          },
          amount: ({ percent }, tools) => {
            // @ts-expect-error Property 'before' does not exist on the tools of a formula.
            void tools.before;
            return percent;
          },
        },
      },
    },
    lines: {
      each: {
        discountBy: {
          relation: {
            default: "amount",
            members: {
              percent: ({ amount }, tools) => {
                const key: RowKey<"lines"> = tools.key;
                const header: number | null = tools.values.gross;
                const by: "percent" | "amount" | null = tools.peek.row.discountBy;
                const gross: number | null = tools.peek.values.gross;
                // @ts-expect-error Property 'before' does not exist on the tools of a row formula.
                void tools.before;
                void [key, header, by, gross];
                return (amount ?? 0) * tools.context.multiplier;
              },
              amount: ({ percent }) => percent,
            },
          },
        },
      },
    },
  },
});

const session = createSession(
  defineForm({ fields, collections, context: formContext, include: [ruleSet] }),
  {
    context: { multiplier: 2 },
  },
);
const by: "percent" | "amount" | null = session.getSnapshot().values.discountBy;
void by;
session.edit("discountBy", null);
// @ts-expect-error "other" is not an option of discountBy.
session.edit("discountBy", "other");

const relation = {
  default: "percent",
  members: { percent: () => 1, amount: () => 2 },
} as const;
const changing = defineRules({ fields, rules: { percent: { onEdit: () => ({}) } } });
defineForm({
  fields,
  collections,
  context: formContext,
  // @ts-expect-error field "percent" onChange or onEdit is declared by another rule set.
  include: [ruleSet, changing],
});
defineForm({
  fields,
  collections,
  context: formContext,
  // @ts-expect-error field "amount" of "lines" value is declared in rules too.
  include: [ruleSet],
  rules: { lines: { each: { amount: { value: () => 3 } } } },
});
defineForm({
  fields: { ...fields, discountBy: field.select({ options: [{ value: "percent", label: "P" }] }) },
  collections,
  context: formContext,
  // @ts-expect-error rule set requires field "discountBy" of another type.
  include: [ruleSet],
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error field "amount" value is taken by the relation of "discountBy".
      relation,
    },
    amount: { value: () => 3 },
  },
});
defineRules({
  collections,
  rules: {
    lines: {
      each: {
        discountBy: {
          // @ts-expect-error field "amount" of "lines" onChange is taken by the relation of "discountBy".
          relation,
        },
        amount: { onChange: () => ({}) },
      },
    },
  },
});

defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation of "discountBy" takes two members.
      relation: { default: "amount", members: { amount: () => 1 } },
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation of "discountBy" takes two members.
      relation: { ...relation, members: { ...relation.members, gross: () => 1 } },
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation default "gross" of "discountBy" is not a member.
      relation: { ...relation, default: "gross" },
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error Property 'default' is missing.
      relation: { members: relation.members },
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation of "discountBy" takes default and members.
      relation: () => relation,
    },
  },
});
defineForm({
  fields,
  rules: {
    gross: {
      // @ts-expect-error field "gross" drives a relation, it must be a text or a select.
      relation,
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation of "discountBy" takes default and members, not "base".
      relation: { ...relation, base: "gross" },
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error field "discountBy" cannot be a member of its own relation.
      relation: { default: "amount", members: { amount: () => 1, discountBy: () => "percent" } },
    },
  },
});
defineRules({
  fields: { ...fields, driver: field.text() },
  rules: {
    driver: {
      // @ts-expect-error relation member "unknown" of "driver" is not a field.
      relation: { default: "amount", members: { amount: () => 1, unknown: () => 2 } },
    },
  },
});
defineRules({
  fields: { ...fields, discountBy: field.select({ options: [{ value: "percent", label: "P" }] }) },
  rules: {
    discountBy: {
      // @ts-expect-error relation member "amount" is not an option of field "discountBy".
      relation,
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      relation: {
        ...relation,
        members: {
          percent: () => 1,
          // @ts-expect-error Type 'string' is not assignable to type 'number'.
          amount: () => "bad",
        },
      },
    },
  },
});

declare const optionalMembers: { readonly percent: () => number; readonly amount?: () => number };
declare const splitMembers: { readonly percent: () => number } | { readonly amount: () => number };
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation member "amount" of "discountBy" must have a formula.
      relation: { default: "percent", members: optionalMembers },
    },
  },
});
defineForm({
  fields,
  rules: {
    discountBy: {
      // @ts-expect-error relation of "discountBy" takes two members in each alternative.
      relation: { default: "percent", members: splitMembers },
    },
  },
});

declare const useRelation: boolean;
defineForm({
  fields,
  rules: useRelation ? { discountBy: { relation } } : { amount: { value: () => 0 } },
});

defineForm({
  fields: { ...fields, discountBy: useRelation ? fields.discountBy : field.text() },
  rules: { discountBy: { relation } },
});
defineForm({
  fields: { "": field.number(), amount: field.number(), driver: field.text() },
  rules: {
    driver: {
      // @ts-expect-error field "driver" cannot have a member named after the empty text "".
      relation: { default: "amount", members: { "": () => 1, amount: () => 2 } },
    },
  },
});
