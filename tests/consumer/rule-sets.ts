// Rule sets in types: the sale family of the guide, whose sets declare the
// shape of the family and infer their rules without annotations, and an order
// and a quote that include them. A composed form has the type of its twin
// written inline.
import {
  createForms,
  createSession,
  declareContext,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
  type BoundDefineRules,
  type DeepReadonly,
  type FormDefinition,
  type FormQueries,
  type Merged,
  type QueryState,
  type RowKey,
  type RowQueries,
  type RuleSet,
  type Session,
} from "trama-forms/core";
import { header, lotParams, pricing } from "./rows-queries.js";
import { inventory, type Equal, type Lot, type Product } from "./rows-async.js";

export const { defineForm, defineRules, field } = createForms({ endpoints: [inventory, pricing] });
export type { Equal };
export const enabled = Math.random() < 2;
type Sent = { sent: boolean };
export const sent = declareContext<Sent>();

export const lineFields = {
  product: field.async("products", { label: "Product" }),
  warehouse: field.select({
    label: "Warehouse",
    options: [
      { value: "central", label: "Central" },
      { value: "north", label: "North" },
    ],
  }),
  lot: field.async("lots", { label: "Lot" }),
  quantity: field.number({ label: "Quantity", default: 1 }),
  price: field.number({ label: "Price" }),
  discount: field.number({ label: "Discount" }),
  amount: field.number({ label: "Amount", readOnly: true }),
};
export const sale = {
  fields: { ...header, notes: field.text({ label: "Notes" }) },
  collections: { lines: { fields: lineFields } },
};

// Each set infers its rules from the shape it declares, without annotations.
export const lots = defineRules({
  ...sale,
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
export const pricingRules = defineRules({
  ...sale,
  rules: {
    lines: {
      each: {
        price: {
          query: {
            endpoint: "linePrice",
            params: ({ product }, { values, key }) => {
              void (key satisfies RowKey<"lines">);
              return product === null || values.priceList === null
                ? undefined
                : { product: product.value, list: values.priceList };
            },
          },
        },
      },
    },
  },
});
export const amounts = defineRules({
  ...sale,
  rules: {
    lines: { each: { amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) } } },
  },
});
export const discountedAmounts = defineRules({
  ...sale,
  rules: {
    lines: {
      each: {
        amount: {
          value: ({ quantity, price, discount }) =>
            (quantity ?? 0) * (price ?? 0) * (1 - (discount ?? 0) / 100),
        },
      },
    },
  },
});
export const totals = defineRules({
  ...sale,
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
  },
});
export const sentLock = defineRules({
  ...sale,
  context: sent,
  rules: {
    notes: {
      disabled: (_, { context }) => {
        void (true satisfies Equal<typeof context, DeepReadonly<Sent>>);
        return context.sent && "Sent";
      },
    },
    lines: { each: { quantity: { readOnly: (_, { context }) => context.sent && "Sent" } } },
  },
});
export const salePreset = [lots, pricingRules, amounts, totals] as const;

// The order includes the preset and the lock, and adds to lot, whose params
// lots gives, a hidden of its own: the entries of a form stay open.
export const order = defineForm({
  ...sale,
  context: sent,
  include: [...salePreset, sentLock],
  rules: {
    lines: {
      each: {
        lot: {
          hidden: ({ product }) => {
            void (true satisfies Equal<typeof product, DeepReadonly<Product> | null>);
            return product === null;
          },
        },
      },
    },
  },
});
export const quote = defineForm({
  ...sale,
  include: [lots, pricingRules, discountedAmounts, totals],
});
// A variant chosen when the form is defined: the twin of each choice is
// another definition.
export const variant = (discounts: boolean) =>
  defineForm({
    ...sale,
    include: [lots, pricingRules, discounts ? discountedAmounts : amounts, totals],
  });

// The twin of the order, written inline, has the same type.
const inline = defineForm({
  ...sale,
  context: sent,
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    notes: { disabled: (_, { context }) => context.sent && "Sent" },
    lines: {
      each: {
        lot: { params: lotParams, hidden: ({ product }) => product === null },
        price: {
          query: {
            endpoint: "linePrice",
            params: ({ product }, { values }) =>
              product === null || values.priceList === null
                ? undefined
                : { product: product.value, list: values.priceList },
          },
        },
        amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
        quantity: { readOnly: (_, { context }) => context.sent && "Sent" },
      },
    },
  },
});
const twins: [
  Equal<typeof order, typeof inline>,
  Equal<FormQueries<typeof order>, {}>,
  Equal<RowQueries<typeof order, "lines">, { readonly price: QueryState }>,
  Equal<RowQueries<typeof quote, "lines">, { readonly price: QueryState }>,
  Equal<RowQueries<ReturnType<typeof variant>, "lines">, { readonly price: QueryState }>,
] = [true, true, true, true, true];
void twins;

// Sessions of composed forms are sessions of the wide definition.
const session = createSession(order, { scope: "acme", context: { sent: false } });
const wide: Session<FormDefinition> = session;
void wide;
const line = session.row("lines", session.getSnapshot().rows.lines[0] as RowKey<"lines">);
void (line.getSnapshot()?.queries.price satisfies QueryState | undefined);
void (line.getSnapshot()?.values.lot satisfies DeepReadonly<Lot> | null | undefined);

// A set of the core enters a form of createForms and one of the core; the
// wide RuleSet takes any set.
const core = coreRules({
  fields: { notes: coreField.text() },
  rules: { notes: { hidden: ({ notes }) => notes === "" } },
});
coreForm({ fields: { notes: coreField.text() }, include: [core] });
defineForm({ ...sale, include: [core, lots] });
const any: RuleSet = lots;
const all: readonly RuleSet[] = [lots, core, sentLock];
void [any, all];
// createForms returns its defineRules.
const bound = createForms({ endpoints: [inventory] });
const ofBound: BoundDefineRules<Merged<[typeof inventory]>> = bound.defineRules;
void ofBound;
