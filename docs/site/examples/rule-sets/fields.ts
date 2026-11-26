import { field } from "../../forms.ts";

const priceLists = [
  { value: "general", label: "General" },
  { value: "wholesale", label: "Wholesale" },
] as const;
const warehouses = [
  { value: "central", label: "Central" },
  { value: "north", label: "North" },
  { value: "port", label: "Port" },
] as const;

// The shape of the sales document family. The rule sets declare it as their
// requirements, and the order and quote spread it into their definitions.
export const sale = {
  fields: {
    priceList: field.select({ label: "Price list", options: priceLists, default: "general" }),
    notes: field.text({ label: "Notes" }),
    total: field.number({ label: "Total", readOnly: true }),
  },
  collections: {
    lines: {
      fields: {
        product: field.async("products", { label: "Product", placeholder: "Search for a product" }),
        warehouse: field.select({ label: "Warehouse", options: warehouses, default: "central" }),
        lot: field.async("lots", { label: "Lot", placeholder: "Choose a lot" }),
        quantity: field.number({ label: "Quantity", default: 1 }),
        price: field.number({ label: "Price" }),
        discount: field.number({ label: "Discount %" }),
        amount: field.number({ label: "Amount", readOnly: true }),
      },
    },
  },
};
