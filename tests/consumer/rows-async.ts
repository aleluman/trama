// Async fields in rows, in types: the order of the guide, whose lines choose a
// product from a paged endpoint and a lot from the whole list of their product
// in their warehouse, each.<field>.params with the tools of a row, and the
// lists of a row from its handle.
import {
  createForms,
  createSession,
  declareContext,
  defineEndpoints,
  endpoint,
  type DeepReadonly,
  type FormDefinition,
  type Option,
  type OptionList,
  type RowHandle,
  type RowHandleOf,
  type RowKey,
  type RowSnapshot,
  type Session,
} from "trama-forms/core";

export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export const enabled = Math.random() < 2;

export type Product = Option<{ unit: string }, string>;
export type Lot = Option<{ expires: string }, string>;
declare const api: {
  products(
    search: string,
    page: number,
    signal: AbortSignal,
  ): Promise<{ options: Product[]; more: boolean }>;
  lots(product: string, warehouse: string, signal: AbortSignal): Promise<Lot[]>;
};
export const inventory = defineEndpoints({
  products: endpoint.options(({ search, page, signal }) => api.products(search, page, signal)),
  lots: endpoint.list(
    ({ signal }, { product, warehouse }: { product: string; warehouse: string }) =>
      api.lots(product, warehouse, signal),
  ),
});
export const { defineForm, field } = createForms({ endpoints: [inventory] });

const priceLists = [
  { value: "retail", label: "Retail" },
  { value: "wholesale", label: "Wholesale" },
] as const;
export const warehouses = [
  { value: "central", label: "Central" },
  { value: "north", label: "North" },
] as const;
type Mode = { mode: "create" | "edit" };

export const lineFields = {
  product: field.async("products", { label: "Product" }),
  warehouse: field.select({ label: "Warehouse", options: warehouses }),
  lot: field.async("lots", { label: "Lot" }),
  quantity: field.number({ label: "Quantity", default: 1 }),
  price: field.number({ label: "Price" }),
  amount: field.number({ label: "Amount", readOnly: true }),
};
export const header = {
  priceList: field.select({ label: "Price list", options: priceLists, default: "retail" }),
  total: field.number({ label: "Total", readOnly: true }),
};

export const order = defineForm({
  context: declareContext<Mode>(),
  fields: header,
  collections: { lines: { fields: lineFields } },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    lines: {
      each: {
        // Changing the product clears the lot, with an event of the row.
        product: { onChange: () => ({ lot: null }) },
        lot: {
          // The params of the lists of lot: the product and warehouse of its row.
          params: ({ product, warehouse }, { key, peek, values, context }) => {
            void (true satisfies Equal<typeof product, DeepReadonly<Product> | null>);
            void (true satisfies Equal<typeof warehouse, "central" | "north" | null>);
            void (key satisfies RowKey<"lines">);
            void (peek.row.quantity satisfies number | null);
            void (values.priceList satisfies "retail" | "wholesale" | null);
            void (context.mode satisfies "create" | "edit");
            return product === null || warehouse === null
              ? undefined
              : { product: product.value, warehouse };
          },
        },
        amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
      },
    },
  },
});

// A saved order opens with lines that bring their product and lot.
export const session = createSession(order, {
  scope: "acme",
  context: { mode: "edit" },
  initial: {
    lines: [
      {
        product: { value: "p1", label: "Screws", unit: "kg" },
        warehouse: "central",
        lot: { value: "L-17", label: "L-17", expires: "2027-03-01" },
        quantity: 2,
      },
    ],
  },
});
const [added] = session.add("lines", [{ warehouse: "north" }]);
const line = session.row("lines", added);

// A list from the core, without React: a new list for each view.
const lots = session.row("lines", added).list("lot");
void (true satisfies Equal<typeof lots, OptionList<Lot>>);
void (lots.getSnapshot().options[0]?.expires satisfies string | undefined);
const products = line.list("product");
void (true satisfies Equal<typeof products, OptionList<Product>>);
// A union of names gives one list of the union of their options.
declare const either: "product" | "lot";
const listed = line.list(either);
void (true satisfies Equal<typeof listed, OptionList<Product | Lot>>);
const optionsOf = <O>(list: OptionList<O>) => list.getSnapshot().options;
void optionsOf(line.list(either));
// @ts-expect-error quantity has no option list: list takes product or lot.
line.list("quantity");
// @ts-expect-error session.list names fields of the header; a row field goes through its handle.
session.list("lot");
void (line.getSnapshot()?.values.lot?.expires satisfies string | undefined);
line.edit("lot", { value: "L-2", label: "L-2", expires: "2027-04-01" });
// @ts-expect-error An option of a row has the data of its endpoint.
line.edit("lot", { value: "L-2", label: "L-2" });

// A session of the order is a session of the wide definition, and its handle a
// wide handle and a handle of its collection and fields.
const wide: Session<FormDefinition> = session;
const anyRow: RowHandle = line;
const ofLines: RowHandle<"lines", typeof lineFields> = line;
const anySnapshot: RowSnapshot | undefined = line.getSnapshot();
void [wide, anyRow, ofLines, anySnapshot];
// The wide handle has no async fields in types.
// @ts-expect-error The wide handle lists no field.
anyRow.list("lot");
// A handle of the collection, as a function of the application names it.
const handleOf: (target: Session<typeof order>) => RowHandleOf<typeof order, "lines"> = (target) =>
  target.row("lines", added);
void handleOf;

// A form with async fields only in its rows requires a scope.
// @ts-expect-error scope is required.
createSession(order, { context: { mode: "edit" } });
const rowsOnly = defineForm({
  fields: { note: field.text() },
  collections: { lines: { fields: { product: field.async("products") } } },
});
// @ts-expect-error Also when the header has no async field.
createSession(rowsOnly);
createSession(rowsOnly, { scope: "acme" });

// A collection without async fields has no option list.
const plain = defineForm({
  fields: { note: field.text() },
  collections: { notes: { fields: { text: field.text() } } },
});
const plainSession = createSession(plain);
const [noteKey] = plainSession.add("notes", [{}]);
// @ts-expect-error A row without async fields has no option list.
plainSession.row("notes", noteKey).list("text");

// Collections that a condition chooses, without async fields, need no rules.
const chosen = enabled
  ? { lines: { fields: { amount: field.number() } } }
  : { notes: { fields: { note: field.text() } } };
defineForm({ fields: { title: field.text() }, collections: chosen });
