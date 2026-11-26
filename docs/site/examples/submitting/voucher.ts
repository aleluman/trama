import type { Prepared } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";
import type { VoucherPayload } from "./server.ts";

// A voucher with lines. The customer’s list price is part of the submission, so prepare
// waits for its query to the endpoint from Queries.
export const voucher = defineForm({
  fields: {
    number: field.number({ label: "No." }),
    customer: field.select({
      label: "Customer",
      required: "Choose the customer",
      options: [
        { value: 1, label: "Atlas Trading" },
        { value: 2, label: "Prisma Trading" },
        { value: 3, label: "Compass Trading" },
      ],
    }),
    price: field.number({ label: "List price" }),
  },
  collections: {
    lines: {
      fields: {
        id: field.number({ label: "ID" }),
        quantity: field.number({ label: "Quantity", required: true }),
        amount: field.number({ label: "Amount" }),
      },
    },
  },
  rules: {
    price: {
      query: {
        endpoint: "listPrice",
        params: ({ customer }) => (customer === null ? undefined : { customer }),
        forPrepare: true,
      },
    },
    lines: {
      collection: { error: ({ lines }) => lines.length === 0 && "Add at least one line" },
      each: {
        amount: { value: ({ quantity }, { values }) => (quantity ?? 0) * (values.price ?? 0) },
      },
    },
  },
});

// The application projects the payload its server expects and leaves the amount for the server
// to calculate. prepare has already checked that the customer and quantities are present.
export const toPayload = ({ customer, price, lines }: Prepared<typeof voucher>["values"]) =>
  ({
    customer: customer ?? 0,
    price: price ?? 0,
    lines: lines.map(({ id, quantity }) => ({ id, quantity: quantity ?? 0 })),
  }) satisfies VoucherPayload;
