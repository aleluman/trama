import assert from "node:assert/strict";
import { test } from "node:test";
import { saved } from "./helpers/rows-async.mjs";
import { defineForm, field, handlesOf, setup } from "./helpers/rows-queries.mjs";

// The order in which the queries of a session start, which the direct loader
// makes observable: the header first, then each collection, its rows in
// creation order and the queries of a row in the order of its each, also when
// an operation adds a row and changes the params of another.

// An order whose header asks for a rate, whose lines ask for their stock and
// their price, in that order of rules and the other one of fields, and whose
// boxes, a second collection, ask for their price with params that read how
// many lines there are.
const collections = () => ({
  lines: {
    fields: {
      product: field.async("products"),
      warehouse: field.text(),
      price: field.number(),
      available: field.number(),
    },
  },
  boxes: { fields: { product: field.number(), price: field.number() } },
});
const ordered = () =>
  defineForm({
    fields: { priceList: field.text({ default: "retail" }), rate: field.number() },
    collections: collections(),
    rules: {
      rate: {
        query: {
          endpoint: "linePrice",
          params: ({ priceList }) => ({ product: 0, list: priceList }),
        },
      },
      lines: {
        each: {
          available: {
            query: {
              endpoint: "stock",
              params: ({ product, warehouse }) => product && { product: product.value, warehouse },
              patch: ({ available }) => ({ available }),
            },
          },
          price: {
            query: {
              endpoint: "linePrice",
              params: ({ product }, { values }) =>
                product && { product: product.value, list: values.priceList },
            },
          },
        },
      },
      boxes: {
        each: {
          price: {
            query: {
              endpoint: "linePrice",
              params: ({ product }, { values }) => ({
                product,
                list: `${values.lines.length} lines`,
              }),
            },
          },
        },
      },
    },
  });
// Each request as its endpoint and its product.
const startedOf = (calls) => calls.map(({ key }) => `${key[2]} ${key[3].product}`);

test("Queries start in header order, then by collection, with rows in creation order and templates in rules order", () => {
  const { open, calls } = setup(ordered());
  const session = open([saved(1), saved(2)], { boxes: [{ product: 7 }] });
  assert.deepEqual(startedOf(calls), [
    "linePrice 0",
    "stock 1",
    "linePrice 1",
    "stock 2",
    "linePrice 2",
    "linePrice 7",
  ]);
  // Moving keeps the creation order; a header edit asks again in the same order.
  session.move("lines", handlesOf(session)[1].key, 0);
  calls.length = 0;
  session.edit("priceList", "wholesale");
  assert.deepEqual(startedOf(calls), ["linePrice 0", "linePrice 1", "linePrice 2"]);
});

test("Queries for a newly added line start before those for existing boxes whose params change in the same operation", () => {
  const { open, calls } = setup(ordered());
  const session = open([saved(1)], { boxes: [{ product: 7 }, { product: 8 }] });
  calls.length = 0;
  session.add("lines", [saved(3)], { at: 0 });
  assert.deepEqual(startedOf(calls), ["stock 3", "linePrice 3", "linePrice 7", "linePrice 8"]);
  assert.deepEqual(
    calls.slice(2).map(({ key }) => key[3].list),
    ["2 lines", "2 lines"],
  );
});
