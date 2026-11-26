// Queries in rows in the shapes of queries-members.ts, in types.
// Conditional and optional entries, reused queries, unions of queries and of
// whole sections, at the level of the entry, of each, of the collection and of
// the rules; the state of the queries of each row that results.
import { createSession, type QueryState, type RowQueries } from "trama-forms/core";
import { enabled, type Equal } from "./rows-async.js";
import { defineForm, field, header } from "./rows-queries.js";

// Rows without lot: no entry is required, so every section may be missing.
const fields = {
  product: field.async("products"),
  warehouse: field.select({ options: [{ value: "central", label: "Central" }] }),
  quantity: field.number(),
  price: field.number(),
  available: field.number(),
  note: field.text(),
};
const collections = { lines: { fields } };
const priceQuery = {
  endpoint: "linePrice",
  params: () => ({ product: "p1", list: "retail" }),
} as const;
const stockQuery = {
  endpoint: "stock",
  params: () => ({ product: "p1", warehouse: "central" }),
  patch: (stock: { readonly available: number }) => ({ available: stock.available }),
} as const;
const quantityQuery = {
  endpoint: "linePrice",
  params: () => ({ product: "p1", list: "units" }),
} as const;

// ----------------------------------------------------------------- shapes
// Conditional and optional entries, reused queries with as const and a union
// of valid queries compile.
const optionalEntry: { readonly query?: typeof stockQuery } = { query: stockQuery };
const pick = (on: boolean): typeof priceQuery | typeof quantityQuery =>
  on ? priceQuery : quantityQuery;
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        ...(enabled && { price: { query: priceQuery } }),
        ...(enabled ? { quantity: { query: quantityQuery } } : {}),
        available: optionalEntry,
        note: { hidden: () => false },
      },
    },
  },
});
defineForm({
  fields: header,
  collections,
  rules: { lines: { each: { price: { query: pick(enabled) } } } },
});
const widened = { endpoint: "linePrice", params: () => ({ product: "p1", list: "retail" }) };
defineForm({
  fields: header,
  collections,
  // @ts-expect-error A reused query without as const has endpoint: string.
  rules: { lines: { each: { price: { query: widened } } } },
});
const misspelled = { endpoint: "linePrice", parms: () => ({}) } as const;
defineForm({
  fields: header,
  collections,
  // @ts-expect-error A reused query cannot hide a misspelled property.
  rules: { lines: { each: { price: { query: misspelled } } } },
});
const typo = {
  endpoint: "stock",
  params: () => ({ product: "p", warehouse: "w" }),
  patch: () => ({ availabel: 1 }),
} as const;
defineForm({
  fields: header,
  collections,
  // @ts-expect-error A conditional entry cannot hide a field its patch does not have.
  rules: { lines: { each: { ...(enabled && { available: { query: typo } }) } } },
});
const unfit = { endpoint: "stock", params: () => ({ product: "p", warehouse: "w" }) } as const;
defineForm({
  fields: header,
  collections,
  // @ts-expect-error Nor a result that does not fit.
  rules: { lines: { each: { ...(enabled && { price: { query: unfit } }) } } },
});
const optionalUnfit: { readonly query?: typeof unfit } = { query: unfit };
// @ts-expect-error Nor an optional entry.
defineForm({ fields: header, collections, rules: { lines: { each: { price: optionalUnfit } } } });
const badPick = (on: boolean): typeof priceQuery | typeof unfit => (on ? priceQuery : unfit);
defineForm({
  fields: header,
  collections,
  // @ts-expect-error A valid member of a union of queries does not absorb a result that does not fit.
  rules: { lines: { each: { price: { query: badPick(enabled) } } } },
});

// A helper may return a union of whole sections, at every level; each member is checked.
const withQuery = { price: { query: priceQuery } };
const withoutQuery = { note: { hidden: () => true } };
const badEach = { price: { query: unfit } };
const eachFrom = (on: boolean): typeof withQuery | typeof withoutQuery =>
  on ? withQuery : withoutQuery;
const badEachFrom = (on: boolean): typeof withQuery | typeof badEach => (on ? withQuery : badEach);
const byEach = defineForm({
  fields: header,
  collections,
  rules: { lines: { each: eachFrom(enabled) } },
});
// @ts-expect-error A union of each sections cannot hide a result that does not fit.
defineForm({ fields: header, collections, rules: { lines: { each: badEachFrom(enabled) } } });
const linesFrom = (on: boolean) => (on ? { each: withQuery } : { each: withoutQuery });
const byCollection = defineForm({
  fields: header,
  collections,
  rules: { lines: linesFrom(enabled) },
});
const rulesFrom = (on: boolean) =>
  on ? { lines: { each: withQuery } } : { total: { hidden: () => true } };
const byRules = defineForm({ fields: header, collections, rules: rulesFrom(enabled) });
const badRulesFrom = (on: boolean) =>
  on ? { lines: { each: withQuery } } : { lines: { each: badEach } };
// @ts-expect-error A union of rules sections cannot hide it either.
defineForm({ fields: header, collections, rules: badRulesFrom(enabled) });
// A conditional collection, an entry or a query that may be undefined.
const byCondition = defineForm({
  fields: header,
  collections,
  rules: { ...(enabled && { lines: { each: { price: { query: priceQuery } } } }) },
});
const maybeEntry = defineForm({
  fields: header,
  collections,
  rules: { lines: { each: { price: enabled ? { query: priceQuery } : undefined } } },
});
const maybeQuery = defineForm({
  fields: header,
  collections,
  rules: { lines: { each: { price: { query: enabled ? priceQuery : undefined } } } },
});
const maybeEach = defineForm({
  fields: header,
  collections,
  rules: { lines: { each: enabled ? { price: { query: priceQuery } } : undefined } },
});

// ----------------------------------------------------- the state per row
// A sure query has a required key; one that may be missing, an optional key;
// an entry without query, none.
const order = defineForm({
  fields: header,
  collections,
  rules: {
    total: { value: ({ lines }) => lines.length },
    lines: {
      each: {
        price: { query: priceQuery },
        quantity: { query: enabled ? quantityQuery : undefined },
        note: { hidden: () => false },
        ...(enabled && { available: { query: stockQuery } }),
      },
    },
  },
});
type Optional = { readonly price?: QueryState };
const shapes: [
  Equal<
    RowQueries<typeof order, "lines">,
    { readonly price: QueryState; readonly quantity?: QueryState; readonly available?: QueryState }
  >,
  Equal<RowQueries<typeof byEach, "lines">, Optional>,
  Equal<RowQueries<typeof byCollection, "lines">, Optional>,
  Equal<RowQueries<typeof byRules, "lines">, Optional>,
  Equal<RowQueries<typeof byCondition, "lines">, Optional>,
  Equal<RowQueries<typeof maybeEntry, "lines">, Optional>,
  Equal<RowQueries<typeof maybeQuery, "lines">, Optional>,
  Equal<RowQueries<typeof maybeEach, "lines">, Optional>,
] = [true, true, true, true, true, true, true, true];
void shapes;
const session = createSession(order, { scope: "acme" });
const [key] = session.add("lines", [{}]);
const line = session.row("lines", key);
const queries = line.getSnapshot()?.queries;
void (queries?.price.status satisfies QueryState["status"] | undefined);
void (queries?.quantity?.status satisfies QueryState["status"] | undefined);
line.retry("price");
line.retry("quantity");
line.retry("available");
// @ts-expect-error An optional key may be missing.
void queries?.quantity.status;
// @ts-expect-error An entry without query has no key.
void queries?.note;
// @ts-expect-error retry takes an entry with query.
line.retry("note");
