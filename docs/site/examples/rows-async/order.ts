import type { FormInitial } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";

const warehouses = [
  { value: "central", label: "Central" },
  { value: "north", label: "North" },
  { value: "port", label: "Port" },
] as const;

// An order whose lines select a product from a paginated endpoint and a lot from the
// complete list for that product in the row's warehouse. Each row has its own parameters.
export const order = defineForm({
  fields: { notes: field.text({ label: "Notes" }) },
  collections: {
    lines: {
      fields: {
        product: field.async("products", { label: "Product", placeholder: "Search for a product" }),
        warehouse: field.select({ label: "Warehouse", options: warehouses, default: "central" }),
        lot: field.async("lots", { label: "Lot", placeholder: "Choose a lot" }),
        quantity: field.number({ label: "Quantity", default: 1 }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        // lots requires { product, warehouse } from its row. Without a product, the lists
        // for that row suspend and make no requests.
        lot: {
          params: ({ product, warehouse }) =>
            product === null || warehouse === null
              ? undefined
              : { product: product.value, warehouse },
        },
        // A different product or warehouse makes the selected lot irrelevant, so an event clears it.
        product: { onChange: () => ({ lot: null }) },
        warehouse: { onChange: () => ({ lot: null }) },
      },
    },
  },
});

// Two saved lines with their complete product options as returned by the server.
export const initial: FormInitial<typeof order> = {
  lines: [
    { product: { value: "TOR-2", label: "Screw 3 × 20 mm", unit: "box" }, quantity: 4 },
    { product: { value: "TUE-2", label: "Nut 3 × 20 mm", unit: "box" }, quantity: 4 },
  ],
};
