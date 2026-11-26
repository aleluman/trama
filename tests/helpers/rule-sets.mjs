// A sale family for the suites of rule sets: a header with a price list, a
// rate and a total, and lines that choose a product and a lot and ask for
// their price. Sets and forms are declared with the same shape, sale, as the
// guide does. Sessions ask through the scripted loader, a mock: each request
// waits until the test settles it, and resolve() runs the endpoint's load.
import { createForms, defineEndpoints, endpoint } from "trama-forms/core";
import { inventory, lotParams } from "./rows-async.mjs";
import { byProduct, priceOf } from "./rows-queries.mjs";
import { normalizer, statesOf } from "./rule-sets-fuzz-run.mjs";
export { handlesOf, saved, setup } from "./rows-async.mjs";
export { byProduct };

export const prices = defineEndpoints({
  linePrice: endpoint.value((_, params) => Promise.resolve(priceOf(params))),
  rate: endpoint.value(() => Promise.resolve(2)),
});
export const { defineForm, defineRules, field } = createForms({ endpoints: [inventory, prices] });

export const header = {
  priceList: field.text({ default: "retail" }),
  rate: field.number({ default: 1 }),
  notes: field.text(),
  total: field.number(),
};
export const lineFields = {
  product: field.async("products"),
  warehouse: field.text(),
  lot: field.async("lots"),
  quantity: field.number({ default: 1 }),
  price: field.number(),
  discount: field.number(),
  amount: field.number(),
};
export const sale = { fields: header, collections: { lines: { fields: lineFields } } };

const amountOf = ({ quantity, price }) => (quantity ?? 0) * (price ?? 0);
const sumOf = ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);

// The rules of the family, each of them as an inline section and as a set.
export const rules = {
  lots: { lines: { each: { lot: { params: lotParams } } } },
  pricing: { lines: { each: { price: { query: { endpoint: "linePrice", params: byProduct } } } } },
  amounts: { lines: { each: { amount: { value: amountOf } } } },
  totals: { total: { value: sumOf } },
};
export const sets = Object.fromEntries(
  Object.entries(rules).map(([name, section]) => [name, defineRules({ ...sale, rules: section })]),
);

// What a session publishes, comparable with what its twin publishes: the
// values and states of the header and of each row, and the states of its
// queries, with the message of each error, normalized as the fuzz does: rows
// by the order the observer first saw them, which is their creation order
// when it looks after every operation, and labels without the place of a
// rule set.
export const observer = () => {
  const { name, text } = normalizer();
  return (session) => {
    const { values, fieldStates, queries, rows } = session.getSnapshot();
    const { lines: _lines, ...rest } = values;
    return {
      header: rest,
      fieldStates,
      queries: statesOf(queries, text),
      rows: (rows.lines ?? []).map((key) => {
        const snapshot = session.row("lines", key).getSnapshot();
        return [name(key), snapshot.values, snapshot.fieldStates, statesOf(snapshot.queries, text)];
      }),
    };
  };
};
