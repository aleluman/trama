import type { FormInitial } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";

const priceLists = [
  { value: "general", label: "General" },
  { value: "wholesale", label: "Wholesale" },
] as const;
const warehouses = [
  { value: "central", label: "Central" },
  { value: "north", label: "North" },
  { value: "port", label: "Port" },
] as const;
// lots requires { product, warehouse } from the row, or undefined while the product is missing.
const lotParams = ({
  product,
  warehouse,
}: {
  readonly product: { readonly value: string } | null;
  readonly warehouse: string | null;
}) => (product === null || warehouse === null ? undefined : { product: product.value, warehouse });

// An order whose lines query their price using their product and the header's price list.
// Each line is a separate entry. Its query starts with the row, and removing the row
// invalidates it.
export const priced = defineForm({
  fields: {
    priceList: field.select({ label: "Price list", options: priceLists, default: "general" }),
  },
  collections: {
    lines: {
      fields: {
        product: field.async("products", { label: "Product", placeholder: "Search for a product" }),
        warehouse: field.select({ label: "Warehouse", options: warehouses, default: "central" }),
        lot: field.async("lots", { label: "Lot", placeholder: "Choose a lot" }),
        quantity: field.number({ label: "Quantity", default: 1 }),
        price: field.number({ label: "Price" }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        // Without a patch, the number returned by linePrice is written to the row's price.
        price: {
          query: {
            endpoint: "linePrice",
            params: ({ product }, { values }) =>
              product === null || values.priceList === null
                ? undefined
                : { product: product.value, list: values.priceList },
          },
        },
        // The lot queries the complete list for its product in its warehouse and selects
        // the only option if the row has no lot.
        lot: {
          params: lotParams,
          query: {
            endpoint: "lots",
            params: lotParams,
            patch: (lots, { row }) =>
              row.lot === null && lots.length === 1 ? { lot: lots[0] } : undefined,
          },
        },
        product: { onChange: () => ({ lot: null }) },
        warehouse: { onChange: () => ({ lot: null }) },
      },
    },
  },
});

// Two saved lines with their price and lot. Opening them runs no queries.
export const initial: FormInitial<typeof priced> = {
  priceList: "general",
  lines: [
    {
      product: { value: "TOR-2", label: "Screw 3 × 20 mm", unit: "box" },
      lot: { value: "C-801", label: "C-801 · expires 2027-05", expires: "2027-05" },
      quantity: 4,
      price: 200,
    },
    {
      product: { value: "TUE-2", label: "Nut 3 × 20 mm", unit: "box" },
      warehouse: "north",
      lot: { value: "N-731", label: "N-731 · expires 2027-04", expires: "2027-04" },
      quantity: 2,
      price: 1000,
    },
  ],
};
