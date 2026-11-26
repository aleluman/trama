// Queries in rows, in types: the order of the guide, whose lines ask for their
// price by their product and the price list of the header, for their stock
// with a patch, and for their lots, selecting the only one. The state of the
// queries of each row is on its handle, as retry.
import {
  createForms,
  createSession,
  declareContext,
  defineEndpoints,
  endpoint,
  type DeepReadonly,
  type FormDefinition,
  type QueryState,
  type RowHandle,
  type RowHandleOf,
  type RowKey,
  type RowQueries,
  type RowSnapshot,
  type Session,
} from "trama-forms/core";
import { header, inventory, lineFields as asyncLines, type Equal, type Lot } from "./rows-async.js";

export { header };
export type Stock = { available: number; reserved: number };
declare const api: {
  linePrice(product: string, list: string, signal: AbortSignal): Promise<number>;
  stock(product: string, warehouse: string, signal: AbortSignal): Promise<Stock>;
};
// The pricing registry used alongside the inventory registry.
export const pricing = defineEndpoints({
  linePrice: endpoint.value(({ signal }, { product, list }: { product: string; list: string }) =>
    api.linePrice(product, list, signal),
  ),
  stock: endpoint.value(
    ({ signal }, { product, warehouse }: { product: string; warehouse: string }) =>
      api.stock(product, warehouse, signal),
  ),
});
export const { defineForm, field } = createForms({ endpoints: [inventory, pricing] });
type Mode = { mode: "create" | "edit" };

export const lineFields = {
  ...asyncLines,
  available: field.number({ label: "Available", readOnly: true }),
};
export const lotParams = ({
  product,
  warehouse,
}: {
  readonly product: { readonly value: string } | null;
  readonly warehouse: string | null;
}) => (product === null || warehouse === null ? undefined : { product: product.value, warehouse });

export const order = defineForm({
  context: declareContext<Mode>(),
  fields: header,
  collections: { lines: { fields: lineFields } },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    lines: {
      each: {
        lot: {
          params: lotParams,
          // The whole list of lots; patch selects the only option while lot is empty.
          query: {
            endpoint: "lots",
            params: lotParams,
            patch: (lots, { row }) => {
              void (true satisfies Equal<typeof lots, readonly DeepReadonly<Lot>[]>);
              return row.lot === null && lots.length === 1 ? { lot: lots[0] } : undefined;
            },
          },
        },
        // Without patch, the number is written to price, in its row.
        price: {
          query: {
            endpoint: "linePrice",
            params: ({ product }, { values }) =>
              product === null || values.priceList === null
                ? undefined
                : { product: product.value, list: values.priceList },
          },
        },
        // The stock, only in create mode; patch writes available from the result.
        available: {
          query: {
            endpoint: "stock",
            params: ({ product, warehouse }, { context }) =>
              context.mode !== "create" || product === null || warehouse === null
                ? undefined
                : { product: product.value, warehouse },
            patch: (stock, { row, values, key, context }) => {
              void (true satisfies Equal<typeof stock, DeepReadonly<Stock>>);
              void (row.quantity satisfies number | null);
              void (values.lines[0]?.price satisfies number | null | undefined);
              void (key satisfies RowKey<"lines">);
              void (context.mode satisfies "create" | "edit");
              return { available: stock.available };
            },
          },
        },
        amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
      },
    },
  },
});

// The queries of each row: lot, price and available declare one, quantity none.
const rowQueries: [
  Equal<
    RowQueries<typeof order, "lines">,
    { readonly lot: QueryState; readonly price: QueryState; readonly available: QueryState }
  >,
  Equal<
    RowHandleOf<typeof order, "lines">,
    RowHandle<"lines", typeof lineFields, RowQueries<typeof order, "lines">>
  >,
] = [true, true];
void rowQueries;

// A saved order opens with lines that bring their price and their lot.
export const session = createSession(order, {
  scope: "acme",
  context: { mode: "edit" },
  initial: {
    lines: [
      {
        product: { value: "p1", label: "Screws", unit: "kg" },
        warehouse: "central",
        lot: { value: "L-17", label: "L-17", expires: "2027-03-01" },
        price: 120,
      },
    ],
  },
});
const [added] = session.add("lines", [{ warehouse: "north" }]);
const line = session.row("lines", added);

// The state of the query of price of a row, and its retry.
const status = line.getSnapshot()?.queries.price.status;
void (true satisfies Equal<typeof status, "idle" | "pending" | "error" | undefined>);
void (line.getSnapshot()?.queries.lot.error satisfies Error | undefined);
line.retry("price");
line.retry("lot");
// @ts-expect-error quantity declares no query: retry takes lot, price or available.
line.retry("quantity");
// @ts-expect-error The state of the queries of a row has no key for quantity.
void line.getSnapshot()?.queries.quantity;
const snapshot = line.getSnapshot();
// @ts-expect-error The state of a query of a row is read-only.
if (snapshot) snapshot.queries.price = { status: "idle", error: undefined };
// snapshot.queries and session.retry stay of the header, which has no query.
void (true satisfies Equal<keyof ReturnType<typeof session.getSnapshot>["queries"], never>);
// @ts-expect-error session.retry takes no entry of a row.
session.retry("price");

// Duplicating a line copies its price and its lot, which are then supplied.
export const duplicate = (target: Session<typeof order>, key: RowKey<"lines">) => {
  const values = target.row("lines", key).getSnapshot()?.values;
  if (values === undefined) return;
  const { amount: _amount, ...copy } = values;
  return target.add("lines", [copy], { at: target.getSnapshot().rows.lines.indexOf(key) + 1 });
};
void duplicate(session, added);

// A session of the order is a session of the wide definition, and its handle
// a wide handle and a handle with two arguments.
const wide: Session<FormDefinition> = session;
const anyRow: RowHandle = line;
const twoArguments: RowHandle<"lines", typeof lineFields> = line;
const anySnapshot: RowSnapshot | undefined = line.getSnapshot();
void [wide, anyRow, twoArguments, anySnapshot];
// Generic code keeps the names of the queries of the rows of a collection.
const retryAll = <D extends FormDefinition, N extends keyof D["collections"] & string>(
  target: Session<D>,
  collection: N,
  name: keyof RowQueries<D, N> & string,
) => {
  for (const key of target.getSnapshot().rows[collection]) target.row(collection, key).retry(name);
};
retryAll(session, "lines", "price");
// @ts-expect-error The names are those of the queries of the rows of that collection.
retryAll(session, "lines", "quantity");
// The wide handle takes any name, and every state may be missing.
anyRow.retry("anything");
void (anyRow.getSnapshot()?.queries.anything?.status satisfies QueryState["status"] | undefined);

// A collection without queries has the same {} in every row, and retry says so.
const plain = defineForm({
  fields: { note: field.text() },
  collections: { notes: { fields: { text: field.text() } } },
});
const plainSession = createSession(plain);
const noteRow = plainSession.row("notes", plainSession.add("notes", [{}])[0]);
void (true satisfies Equal<RowQueries<typeof plain, "notes">, {}>);
void (true satisfies Equal<NonNullable<ReturnType<typeof noteRow.getSnapshot>>["queries"], {}>);
// @ts-expect-error A collection without queries: the message says so.
noteRow.retry("text");
// A form without collections keeps its types: the sixth argument is {}.
const flat = defineForm({ fields: { note: field.text() } });
void (true satisfies Equal<
  typeof flat,
  FormDefinition<{ readonly note: ReturnType<typeof field.text> }, {}, undefined, {}, {}, {}>
>);
// A definition written with five arguments takes the wide sixth one.
type Lines = { readonly lines: { readonly fields: typeof lineFields } };
const fiveArguments: Session<FormDefinition<typeof header, {}, Mode, {}, Lines>> = session;
void fiveArguments;

// Queries only in rows require a scope.
const rowsOnly = defineForm({
  fields: { note: field.text() },
  collections: { lines: { fields: { code: field.text(), price: field.number() } } },
  rules: {
    lines: {
      each: {
        price: { query: { endpoint: "linePrice", params: () => ({ product: "p", list: "l" }) } },
      },
    },
  },
});
// @ts-expect-error scope is required.
createSession(rowsOnly);
createSession(rowsOnly, { scope: "acme" });
// Also when the queries of the rows are a union whose members share no key.
type RowsOnly = typeof rowsOnly;
type Either = { readonly lines: RowQueries<RowsOnly, "lines"> | { readonly code: QueryState } };
const either: FormDefinition<
  RowsOnly["fields"],
  {},
  undefined,
  {},
  RowsOnly["collections"],
  Either
> = rowsOnly;
// @ts-expect-error scope is required when a member of the union has queries.
createSession(either);
