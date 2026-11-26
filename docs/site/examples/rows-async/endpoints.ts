import { defineEndpoints, endpoint, type Option } from "trama-forms/core";
import { fetchLinePrice, fetchLots, fetchProducts } from "./api.ts";

export type Product = Option<{ unit: string }, string>;
export type Lot = Option<{ expires: string }, string>;

// The inventory endpoints return products in pages with server-side search, a complete
// list of the lots for a product in a warehouse with local search, and the price of a
// product on a price list as a value.
export const inventory = defineEndpoints({
  products: endpoint.options(async ({ search, page, signal }) => {
    const { rows, more } = await fetchProducts({ search, page }, signal);
    return {
      options: rows.map((row) => ({ value: row.id, label: row.name, unit: row.unit })),
      more,
    };
  }),
  lots: endpoint.list(
    async ({ signal }, { product, warehouse }: { product: string; warehouse: string }) =>
      (await fetchLots(product, warehouse, signal)).map((row) => ({
        value: row.code,
        label: `${row.code} · expires ${row.expires}`,
        expires: row.expires,
      })),
  ),
  linePrice: endpoint.value(({ signal }, { product, list }: { product: string; list: string }) =>
    fetchLinePrice(product, list, signal),
  ),
});
