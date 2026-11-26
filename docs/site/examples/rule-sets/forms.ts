import type { FormInitial } from "trama-forms/core";
import { defineForm } from "../../forms.ts";
import { sale } from "./fields.ts";
import {
  amounts,
  discountedAmounts,
  lotParamsOnly,
  lots,
  pricing,
  salePreset,
  sent,
  sentLock,
  totals,
} from "./rules.ts";

// The order includes the preset and the lock for sent orders. Its rules add a rule
// of their own to the lot, whose parameters come from lots. A form's entries can be extended.
export const order = defineForm({
  ...sale,
  context: sent,
  include: [...salePreset, sentLock],
  rules: { lines: { each: { lot: { hidden: ({ product }) => product === null } } } },
});

// The quote shares the rule sets except for amounts, which include a discount.
export const quote = defineForm({
  ...sale,
  include: [lots, pricing, discountedAmounts, totals],
});

// The variant is chosen at definition time. Each value gives a different definition
// with its own sessions. Both alternatives supply the lot parameters, so they are always present.
export const variant = (automatic: boolean) =>
  defineForm({
    ...sale,
    include: [automatic ? lots : lotParamsOnly, pricing, amounts, totals],
  });

// Both documents open with the same saved line.
export const initial = {
  lines: [
    {
      product: { value: "TOR-2", label: "Screw 3 × 20 mm", unit: "box" },
      lot: { value: "C-801", label: "C-801 · expires 2027-05", expires: "2027-05" },
      quantity: 4,
      price: 200,
      discount: 10,
    },
  ],
} satisfies FormInitial<typeof quote>;
