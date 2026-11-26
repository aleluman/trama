// Queries in rows, in types: the negatives of their definition. Each fails for
// the reason its directive gives.
import { defineForm as coreDefineForm, field as coreField } from "trama-forms/core";
import { enabled } from "./rows-async.js";
import { defineForm, header, lineFields, lotParams } from "./rows-queries.js";

const collections = { lines: { fields: lineFields } };
// What every valid form needs: lot requires params, because lots requires them.
const lot = { params: lotParams };
const stockParams = () => ({ product: "p1", warehouse: "central" });

defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot,
        // @ts-expect-error linePrice requires params.
        price: { query: { endpoint: "linePrice" } },
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
        lot,
        // @ts-expect-error A paged endpoint cannot be queried.
        product: { query: { endpoint: "products" } },
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
        lot,
        // @ts-expect-error Without patch, the stock does not fit field "price" of "lines".
        price: { query: { endpoint: "stock", params: stockParams } },
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
        // @ts-expect-error Nor the whole list of lots fits the field lot.
        lot: { ...lot, query: { endpoint: "lots", params: lotParams } },
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
        lot,
        // @ts-expect-error An explicit undefined patch is no patch.
        price: { query: { endpoint: "stock", params: stockParams, patch: undefined } },
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
        lot,
        available: {
          // @ts-expect-error A patch of a row writes its own row: total is a field of the header.
          query: {
            endpoint: "stock",
            params: stockParams,
            patch: (stock) => ({ available: stock.available, total: stock.reserved }),
          },
        },
      },
    },
  },
});
const toTotal = (stock: { readonly available: number }) => ({ total: stock.available });
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot,
        // @ts-expect-error Also in a reused function.
        available: { query: { endpoint: "stock", params: stockParams, patch: toTotal } },
      },
    },
  },
});
const misspelled = (stock: { readonly available: number }) => ({ availabel: stock.available });
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot,
        // @ts-expect-error A field the row does not have.
        available: { query: { endpoint: "stock", params: stockParams, patch: misspelled } },
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
        lot,
        available: {
          // @ts-expect-error Nor the patch of another row, nested by collection.
          query: { endpoint: "stock", params: stockParams, patch: () => ({ lines: {} }) },
        },
      },
    },
  },
});
const later = (stock: { readonly available: number }) =>
  Promise.resolve({ available: stock.available });
defineForm({
  fields: header,
  collections,
  rules: {
    lines: {
      each: {
        lot,
        // @ts-expect-error patch is synchronous.
        available: { query: { endpoint: "stock", params: stockParams, patch: later } },
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
        lot,
        available: {
          query: {
            endpoint: "stock",
            params: stockParams,
            // @ts-expect-error patch reads its row as data: it has no peek.
            patch: (_, { peek }) => ({ available: Number(peek) }),
          },
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
        lot,
        price: {
          query: {
            endpoint: "linePrice",
            params: () => ({ product: "p1", list: "retail" }),
            // @ts-expect-error Nor toDefaults, which only events have.
            patch: (price, { toDefaults }) => ({ price: Number(toDefaults) + price }),
          },
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
        lot,
        price: {
          // @ts-expect-error query property "parms" does not exist.
          query: { endpoint: "linePrice", params: () => ({ product: "p", list: "x" }), parms: 1 },
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
        lot,
        price: {
          query: {
            endpoint: "linePrice",
            // @ts-expect-error The params of linePrice: list is a string.
            params: ({ product }) =>
              product === null ? undefined : { product: product.value, list: 1 },
          },
        },
      },
    },
  },
});
const priced = {
  lot,
  price: { query: { endpoint: "linePrice", params: () => ({ product: "p", list: "l" }) } },
} as const;
const maybe = enabled ? { lines: { each: priced } } : undefined;
// @ts-expect-error Rules that may be undefined cannot declare queries of rows.
defineForm({ fields: header, collections, rules: maybe });

coreDefineForm({
  fields: { note: coreField.text() },
  collections: { lines: { fields: { price: coreField.number() } } },
  // @ts-expect-error The defineForm of trama-forms/core has no endpoints to query, also in rows.
  rules: { lines: { each: { price: { query: { endpoint: "linePrice" } } } } },
});
