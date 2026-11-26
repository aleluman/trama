import { declareContext } from "trama-forms/core";
import { defineRules } from "../../forms.ts";
import { sale } from "./fields.ts";

// Each rule set declares the family's shape and writes rules without type annotations.
// A rule set used by multiple form families declares the fields its rules require, including the fields they write.

// lots requires { product, warehouse } from the row, or undefined while the product is missing.
const lotParams = ({
  product,
  warehouse,
}: {
  readonly product: { readonly value: string } | null;
  readonly warehouse: string | null;
}) => (product === null || warehouse === null ? undefined : { product: product.value, warehouse });

// A different product or warehouse makes the selected lot irrelevant, so an event clears it.
const clearLot = {
  product: { onChange: () => ({ lot: null }) },
  warehouse: { onChange: () => ({ lot: null }) },
};

// Supplies the lot parameters and selects the lot if the list contains only one.
export const lots = defineRules({
  ...sale,
  rules: {
    lines: {
      each: {
        ...clearLot,
        lot: {
          params: lotParams,
          query: {
            endpoint: "lots",
            params: lotParams,
            patch: (found, { row }) =>
              row.lot === null && found.length === 1 ? { lot: found[0] } : undefined,
          },
        },
      },
    },
  },
});
// The variant without automatic selection supplies the parameters and clears the lot
// without selecting one.
export const lotParamsOnly = defineRules({
  ...sale,
  rules: { lines: { each: { ...clearLot, lot: { params: lotParams } } } },
});
// Each line's price, based on its product and the header's price list.
export const pricing = defineRules({
  ...sale,
  rules: {
    lines: {
      each: {
        price: {
          query: {
            endpoint: "linePrice",
            params: ({ product }, { values }) =>
              product === null || values.priceList === null
                ? undefined
                : { product: product.value, list: values.priceList },
          },
        },
      },
    },
  },
});
export const amounts = defineRules({
  ...sale,
  rules: {
    lines: {
      each: { amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) } },
    },
  },
});
// The quote calculates amounts using each line's discount.
export const discountedAmounts = defineRules({
  ...sale,
  rules: {
    lines: {
      each: {
        amount: {
          value: ({ quantity, price, discount }) =>
            Math.round((quantity ?? 0) * (price ?? 0) * (1 - (discount ?? 0) / 100)),
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

// The session context indicates when an order has been sent and cannot be corrected.
export const sent = declareContext<{ sent: boolean }>();
export const sentLock = defineRules({
  ...sale,
  context: sent,
  rules: {
    notes: { disabled: (_, { context }) => context.sent && "Sent" },
    lines: { each: { quantity: { readOnly: (_, { context }) => context.sent && "Sent" } } },
  },
});

// A preset is a list with as const, which is checked element by element.
export const salePreset = [lots, pricing, amounts, totals] as const;
