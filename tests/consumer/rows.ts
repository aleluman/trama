import {
  createSession,
  declareContext,
  defineForm,
  field,
  type FormInitial,
  type FormValues,
  type RowHandleOf,
  type RowKey,
  type Session,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const depots = [
  { value: "north", label: "North" },
  { value: "south", label: "South" },
] as const;
const products = [
  { value: "p1", label: "Product 1" },
  { value: "p2", label: "Product 2" },
] as const;
const priceOf = (product: "p1" | "p2" | null) => (product === "p1" ? 10 : 25);

// The scenario of the guide: a header that reads its lines and writes all of them.
export const order = defineForm({
  context: declareContext<{ sent: boolean }>(),
  fields: {
    branch: field.select({ options: depots }),
    depot: field.select({ options: depots }),
    rate: field.number({ default: 1 }),
    total: field.number(),
    notes: field.text(),
  },
  collections: {
    lines: {
      fields: {
        id: field.text(),
        product: field.select({ options: products }),
        quantity: field.number({ default: 1 }),
        price: field.number(),
        amount: field.number(),
        lot: field.text(),
        warehouse: field.select({ options: depots }),
        notes: field.text(),
      },
    },
  },
  rules: {
    branch: { disabled: ({ lines }) => lines.length > 0 && "Lines exist" },
    depot: {
      onChange: ({ depot }, { rows }) => ({
        lines: Object.fromEntries(rows.lines.map((key) => [key, { warehouse: depot }])),
      }),
    },
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    lines: {
      each: {
        amount: {
          value: ({ quantity, price }, { values, key, peek }) => {
            void (key satisfies RowKey<"lines">);
            void (peek.row.price satisfies number | null);
            return (quantity ?? 0) * (price ?? 0) * (values.rate ?? 1);
          },
        },
        product: { onChange: ({ product }) => ({ price: priceOf(product) }) },
        quantity: { readOnly: ({ price }) => price === 0 && "Free" },
        warehouse: { onChange: (_, { toDefaults }) => toDefaults("lot") },
        notes: { placeholder: (_, { values }) => values.notes || undefined },
      },
    },
  },
  form: {
    readOnly: {
      value: (_, { context }) => context.sent && "Sent",
      except: ["notes", { lines: ["notes"] }],
    },
  },
  outputs: ({ output }) => ({
    count: output(({ lines }) => lines.filter((line) => (line.quantity ?? 0) > 0).length),
  }),
});

const session = createSession(order, {
  context: { sent: false },
  initial: { branch: "north", lines: [{ id: "L-1", product: "p1", quantity: 2 }, { id: "L-2" }] },
});
const [key] = session.add("lines", [{ product: "p2" }], { at: 0 });
void (key satisfies RowKey<"lines">);
const keys = session.add("lines", [{}, {}]);
void (keys satisfies readonly [RowKey<"lines">, RowKey<"lines">]);
session.row("lines", key).edit("quantity", 3);
session.patch({ notes: "Corrected price", lines: { [key]: { price: 120 } } });
session.patch({
  lines: Object.fromEntries(
    session.getSnapshot().rows.lines.map((line) => [line, { warehouse: "south" }]),
  ),
});
session.move("lines", key, 1);
session.remove("lines", [key]);
session.reset();

// The snapshot holds the rows as data, their keys and the states of each row.
const snapshot = session.getSnapshot();
void (snapshot.rows.lines satisfies readonly RowKey<"lines">[]);
void (snapshot.values.lines[0]?.amount satisfies number | null | undefined);
void (snapshot.fieldStates.lines[0]?.quantity.readOnly satisfies boolean | undefined);
void (snapshot.fieldStates.branch.disabled satisfies boolean);
const values: Equal<
  FormValues<typeof order>,
  {
    branch: "north" | "south" | null;
    depot: "north" | "south" | null;
    rate: number | null;
    total: number | null;
    notes: string;
    lines: {
      id: string;
      product: "p1" | "p2" | null;
      quantity: number | null;
      price: number | null;
      amount: number | null;
      lot: string;
      warehouse: "north" | "south" | null;
      notes: string;
    }[];
  }
> = true;
void values;
const initial: FormInitial<typeof order> = { notes: "", lines: [{ quantity: 1 }] };
void initial;
// collections: undefined declares none, as leaving it out.
const plain = defineForm({ fields: { note: field.text() }, collections: undefined });
const plainValues: Equal<FormValues<typeof plain>, { note: string }> = true;
void plainValues;
void (createSession(plain).getSnapshot().rows satisfies {});

// The handle of a row is typed by its collection and its fields.
type Line = RowHandleOf<typeof order, "lines">;
const line: Line = session.row("lines", key);
void (line.getSnapshot()?.values.quantity satisfies number | null | undefined);
void (line.key satisfies RowKey<"lines">);
const generic = <D extends typeof order>(target: Session<D>) => target.getSnapshot().rows.lines;
void generic(session);
