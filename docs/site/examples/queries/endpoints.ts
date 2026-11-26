import { defineEndpoints, endpoint } from "trama-forms/core";
import { fetchExchangeRate, fetchListPrice, fetchQuote } from "./api.ts";

// The simulated endpoints in Queries and Events return plain data rather than options.
export const pricing = defineEndpoints({
  listPrice: endpoint.value(({ signal }, { customer }: { customer: number }) =>
    fetchListPrice(customer, signal),
  ),
  quote: endpoint.value(({ signal }, { customer }: { customer: number }) =>
    fetchQuote(customer, signal),
  ),
  exchangeRate: endpoint.value(
    ({ signal }, { currency, date }: { currency: "USD" | "EUR"; date: string }) =>
      fetchExchangeRate(currency, date, signal),
  ),
});
