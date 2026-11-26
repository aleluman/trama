import { declareContext, defineForm, field, type FormInitial } from "trama-forms/core";

export const depots = [
  { value: "central", label: "Central" },
  { value: "north", label: "North" },
  { value: "port", label: "Port" },
] as const;
const branches = [
  { value: "osaka", label: "Osaka" },
  { value: "guadalajara", label: "Guadalajara" },
] as const;
const products = [
  { value: "p1", label: "Screws" },
  { value: "p2", label: "Nuts" },
  { value: "p3", label: "Washers" },
] as const;
const prices = { p1: 120, p2: 80, p3: 15 };

// An order with a header and lines. Line rules read the header, and the header writes
// to all lines and reads their aggregates.
export const order = defineForm({
  context: declareContext<{ sent: boolean }>(),
  fields: {
    branch: field.select({ label: "Branch", options: branches, default: "osaka" }),
    depot: field.select({ label: "Default warehouse", options: depots }),
    rate: field.number({ label: "Rate", default: 1 }),
    total: field.number({ label: "Total", readOnly: true }),
    notes: field.text({ label: "Notes" }),
  },
  collections: {
    lines: {
      fields: {
        id: field.text({ label: "ID" }),
        product: field.select({ label: "Product", options: products }),
        quantity: field.number({ label: "Quantity", default: 1 }),
        price: field.number({ label: "Price" }),
        discount: field.number({ label: "Discount %", default: 0 }),
        amount: field.number({ label: "Amount", readOnly: true }),
        // The lot is declared before the warehouse that clears it.
        lot: field.text({ label: "Lot" }),
        warehouse: field.select({ label: "Warehouse", options: depots }),
        notes: field.text({ label: "Notes" }),
      },
    },
  },
  rules: {
    branch: { disabled: ({ lines }) => lines.length > 0 && "There are lines" },
    // Writes to every line, reading only the keys and leaving the values unread.
    depot: {
      onChange: ({ depot }, { rows }) => ({
        lines: Object.fromEntries(rows.lines.map((key) => [key, { warehouse: depot }])),
      }),
    },
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    lines: {
      each: {
        amount: {
          value: ({ quantity, price, discount }, { values }) =>
            Math.round(
              (quantity ?? 0) * (price ?? 0) * (1 - (discount ?? 0) / 100) * (values.rate ?? 1),
            ),
        },
        product: {
          onChange: ({ product }) => ({ price: product === null ? null : prices[product] }),
        },
        discount: { disabled: ({ quantity }) => (quantity ?? 0) <= 0 && "No quantity" },
        warehouse: { onChange: (_, { toDefaults }) => toDefaults("lot") },
      },
    },
  },
  // A sent order is read-only except for the header notes and each line's notes.
  form: {
    readOnly: {
      value: (_, { context }) => context.sent && "Sent",
      except: ["notes", { lines: ["notes"] }],
    },
  },
});

export const initial: FormInitial<typeof order> = {
  depot: "central",
  lines: [
    { id: "L-1", product: "p1", quantity: 2, price: 120, lot: "A-17", warehouse: "central" },
    { id: "L-2", product: "p2", quantity: 5, price: 80, lot: "B-03", warehouse: "central" },
  ],
};
