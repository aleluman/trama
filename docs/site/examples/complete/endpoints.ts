import { defineEndpoints, endpoint, type Option } from "trama-forms/core";
import { fetchContacts, fetchCustomers, fetchPrice, toContact, toCustomer } from "./api.ts";

// Options are plain data and include the value, the label, and what the rules read.
export type Contact = Option<{ email: string }, number>;
export type Customer = Option<{ defaultContact: Contact | null; deliveryHint: string }, number>;

// The sales endpoints are declared without React or TanStack Query and are shared by the forms.
// Customers arrive in pages with server-side search. A customer's contacts arrive as a complete
// list with local search. A customer's price is a value.
export const sales = defineEndpoints({
  customers: endpoint.options(async ({ search, page, signal }) => {
    const { rows, more } = await fetchCustomers({ search, page }, signal);
    return { options: rows.map((row) => toCustomer(row)), more };
  }),
  contacts: endpoint.list(async ({ signal }, { customer }: { customer: number }) =>
    (await fetchContacts(customer, signal)).map((row) => toContact(row)),
  ),
  unitPrice: endpoint.value(({ signal }, { customer }: { customer: number }) =>
    fetchPrice(customer, signal),
  ),
});
