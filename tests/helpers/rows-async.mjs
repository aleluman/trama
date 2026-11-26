// An order whose lines choose a product from a paged endpoint with search, and
// a lot from the whole list of their product in their warehouse, for the
// suites of async fields in rows. Sessions ask through the scripted loader, a
// mock: each request waits until the test settles it, and resolve() runs the
// endpoint's load as the direct loader does.
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { pageOf, scriptedLoader } from "./scripted-loader.mjs";
import { keysOf } from "./session.mjs";

export const scope = "acme";
export const catalog = ["Screw", "Long screw", "Nut", "Washer", "Screw-cutting lathe"].map(
  (label, index) => ({ value: index + 1, label, unit: index % 2 === 0 ? "u" : "kg" }),
);
// The lots of a product in a warehouse, two per pair.
export const lotsOf = ({ product, warehouse }) =>
  [1, 2].map((n) => ({
    value: `${product}-${warehouse}-${n}`,
    label: `Lot ${n} of ${product} in ${warehouse}`,
    expires: `2027-0${n}`,
  }));
export const inventory = defineEndpoints({
  products: endpoint.options((request) => Promise.resolve(pageOf(catalog, request))),
  lots: endpoint.list((_, params) => Promise.resolve(lotsOf(params))),
  unitPrice: endpoint.value(() => Promise.resolve(10)),
});
export const { defineForm, field } = createForms({ endpoints: [inventory] });

// The params of lot: the product and the warehouse of its row, undefined while
// either is missing.
export const lotParams = ({ product, warehouse }) =>
  product === null || warehouse === "" ? undefined : { product: product.value, warehouse };
export const lineFields = () => ({
  product: field.async("products"),
  warehouse: field.text(),
  lot: field.async("lots"),
  quantity: field.number({ default: 1 }),
});
// An order with a header note and lines; rules and fields go over the defaults.
export const orderOf = ({ rules = {}, fields = {}, collections = {} } = {}) =>
  defineForm({
    fields: { note: field.text(), ...fields },
    collections: { lines: { fields: lineFields() }, ...collections },
    rules: { lines: { each: { lot: { params: lotParams } } }, ...rules },
  });

// A session of the definition with the lines given, and the requests it made.
export const setup = (definition = orderOf()) => {
  const { loader, calls } = scriptedLoader();
  const open = (lines = [], initial = {}, context) =>
    createSession(definition, { scope, loader, context, initial: { ...initial, lines } });
  // The requests of an endpoint, in the order they were made.
  const asked = (name) => calls.filter(({ key }) => key[2] === name);
  return { open, calls, asked };
};

export const option = (value) => catalog.find((item) => item.value === value);
export const handlesOf = (session, collection = "lines") =>
  keysOf(session, collection).map((key) => session.row(collection, key));
// A saved line, with its product and its warehouse.
export const saved = (product = 1, warehouse = "north") => ({
  product: option(product),
  warehouse,
});
export const removedRow = (key) => `Collection "lines": row "${key}" was removed`;
