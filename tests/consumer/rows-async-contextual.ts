// Formulas of state beside required params in rows, from the installed
// package: each flag of an entry of each whose params are required types its
// formula from the context, with its row, the values, its key and peek.
import { declareContext, type DeepReadonly, type RowKey } from "trama-forms/core";
import {
  defineForm,
  enabled,
  field,
  header,
  lineFields,
  type Equal,
  type Product,
} from "./rows-async.js";
import { lotParams } from "./rows-queries.js";

const collections = { lines: { fields: lineFields } };
const lotEntry = { params: lotParams };
// lots requires { product, warehouse }: every flag of lot reads its row, the
// values of the form and its key with their types.
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot: {
          params: ({ product, warehouse }) =>
            product === null || warehouse === null
              ? undefined
              : { product: product.value, warehouse },
          disabled: ({ product, warehouse }, { values, key, peek }) => {
            void (true satisfies Equal<typeof product, DeepReadonly<Product> | null>);
            void (true satisfies Equal<typeof warehouse, "central" | "north" | null>);
            void (key satisfies RowKey<"lines">);
            void (peek.row.quantity satisfies number | null);
            return values.priceList === null && "No list";
          },
          hidden: [({ product }) => product === null, ({ quantity }) => quantity === 0],
          readOnly: ({ product }) => product?.unit === "kg" && "By weight",
          required: [({ warehouse }) => warehouse !== null],
        },
      },
    },
  },
});
// A flag before params that read the row, the context in the flags of a row,
// and disabled as an array.
defineForm({
  context: declareContext<{ mode: "create" | "edit" }>(),
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot: {
          hidden: (_, { context }) => context.mode === "edit",
          disabled: [
            ({ quantity }) => quantity === 0 && "No quantity",
            ({ product }) => product === null,
          ],
          params: ({ product, warehouse }) =>
            product === null || warehouse === null
              ? undefined
              : { product: product.value, warehouse },
        },
      },
    },
  },
});
// Controls: a field of the row without required params, and the label and
// the event of the same entry.
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        product: { hidden: ({ quantity }) => quantity === 0 },
        lot: {
          ...lotEntry,
          label: ({ product }) => product?.label,
          onChange: ({ lot }) => ({ quantity: lot === null ? null : 1 }),
        },
      },
    },
  },
});
// The flags of a row still check what they read and what they return.
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot: {
          ...lotEntry,
          // @ts-expect-error The row has no field "missing".
          hidden: ({ missing }) => missing === 1,
        },
      },
    },
  },
});
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot: {
          ...lotEntry,
          // @ts-expect-error A flag returns a boolean, a reason or undefined.
          required: [({ quantity }) => quantity],
        },
      },
    },
  },
});
// A field that is async in one member of a union of collections and text in
// another takes no params, also with explicit type arguments.
const remoteRows = { fields: { choice: field.async("lots") } };
const textRows = { fields: { choice: field.text() } };
const mixed = { lines: enabled ? remoteRows : textRows };
defineForm<typeof header, {}, {}, {}, undefined, unknown, typeof mixed>({
  fields: header,
  collections: mixed,
  rules: {
    lines: {
      each: {
        choice: {
          // @ts-expect-error The text member of choice has no params.
          params: () => ({ product: "p1", warehouse: "central" }),
        },
      },
    },
  },
});
