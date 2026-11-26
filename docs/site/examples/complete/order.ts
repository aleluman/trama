import { declareContext, type FormValues } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";

// The application gives each order session its opening mode, today's date,
// and the company's currency.
export type OrderContext = {
  mode: "create" | "edit" | "view";
  today: string;
  currency: { code: string; taxRate: number };
};

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };

export const order = defineForm({
  context: declareContext<OrderContext>(),
  // The delivery date suggests today's date, calculated when each order opens.
  defaults: ({ today }) => ({ deliveryDate: today }),

  fields: {
    // The customer is selected from an endpoint with search and pagination. Its value is the option.
    customer: field.async("customers", {
      label: "Customer",
      placeholder: "Search for a customer",
      required: true,
    }),
    contact: field.async("contacts", { label: "Contact" }),
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Unit price", default: 5000 }),
    total: field.number({ label: "Net total" }),
    delivery: field.select({
      label: "Delivery",
      options: [
        { value: "shipping", label: "Shipping" },
        { value: "pickup", label: "Store pickup" },
      ],
      default: "shipping",
    }),
    deliveryDate: field.text({ label: "Delivery date", placeholder: "YYYY-MM-DD" }),
    country: field.select({
      label: "Delivery country",
      options: [
        { value: "ES", label: "Spain" },
        { value: "MX", label: "Mexico" },
        { value: "JP", label: "Japan" },
      ],
      default: "ES",
    }),
    city: field.text({ label: "City" }),
    useCapital: field.checkbox({ label: "Use the capital when changing countries" }),
    includeNote: field.checkbox({ label: "Include delivery note", default: true }),
    confirmed: field.checkbox({ label: "Order confirmed" }),
    note: field.text({ label: "Delivery note", default: "Leave at the front desk" }),
  },

  rules: {
    // Choosing a customer suggests the default contact from the customer's option.
    customer: { onChange: ({ customer }) => ({ contact: customer?.defaultContact ?? null }) },
    // Contacts depend on the customer. Without a customer, their list is suspended.
    contact: {
      params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
    },
    // Choosing a customer queries their list price. A saved order keeps its price,
    // and a response that arrives after a price edit leaves that edit intact.
    price: {
      query: {
        endpoint: "unitPrice",
        params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
      },
    },
    // The total is calculated and editable. A manually entered total is preserved until
    // the quantity or the price changes.
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    // Store pickup hides the address. Shipping requires the city.
    delivery: {
      states: ({ delivery }) =>
        delivery === "pickup"
          ? { country: { hidden: true }, city: { hidden: true }, useCapital: { hidden: true } }
          : { city: { required: true } },
    },
    // Changing the country restores the city's default or sets it to the capital if requested.
    country: {
      onChange: ({ country, useCapital }, { toDefaults }) =>
        useCapital && country !== null ? { city: capitals[country] } : toDefaults("city"),
    },
    // For Spain, the field asks for the municipality. In other countries, the definition's label returns.
    city: {
      label: ({ country }) => (country === "ES" ? "Municipality" : undefined),
      placeholder: ({ country }) => (country === null ? undefined : `E.g., ${capitals[country]}`),
    },
    // The note is disabled if it is excluded or the order is confirmed, and it suggests
    // the customer's delivery hint.
    note: {
      disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed],
      placeholder: ({ customer }) => customer?.deliveryHint,
    },
  },

  // A confirmed order is read-only except for the confirmation itself. In view mode,
  // the entire order is read-only.
  form: {
    readOnly: [
      { value: ({ confirmed }) => confirmed && "Order confirmed", except: ["confirmed"] },
      { value: (_, { context }) => context.mode === "view" && "Read-only" },
    ],
  },

  outputs: ({ output }) => {
    const net = output(({ total }) => total ?? 0);
    // The currency comes from context, independently of module constants.
    const totals = output((_, { read, context }) => {
      const rounded = Math.round(read(net));
      const tax = Math.round(read(net) * context.currency.taxRate);
      return { net: rounded, tax, gross: rounded + tax };
    });
    const caption = output(
      (_, { read, context }) => `Total: ${read(totals).gross} ${context.currency.code}`,
    );
    // This fails without a quantity. The other derived outputs and the form stay available.
    const unitPrice = output(({ quantity }, { read }) => {
      if (quantity === null || quantity <= 0) throw new Error("Quantity must be greater than zero");
      return read(net) / quantity;
    });
    const unitCaption = output(
      (_, { read, context }) => `${read(unitPrice).toFixed(2)} ${context.currency.code} per unit`,
    );
    return { totals, caption, unitPrice, unitCaption };
  },
});

export type OrderValues = FormValues<typeof order>;
