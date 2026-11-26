// An order whose lines ask for their price by their product and the price list
// of the header, for the suites of queries in rows. Sessions ask through the
// scripted loader, a mock: each request waits until the test settles it, and
// resolve() runs the endpoint's load as the direct loader does.
import { isDeepStrictEqual } from "node:util";
import { createForms, defineEndpoints, endpoint } from "trama-forms/core";
import { inventory, lotParams, option, scope, setup as opener } from "./rows-async.mjs";
import { settle } from "./scripted-loader.mjs";
export { handlesOf } from "./rows-async.mjs";

// What the simulated server answers: the price of a product in a list, and the
// stock of a product in a warehouse.
export const priceOf = ({ product, list }) => (list === "wholesale" ? 90 : 100) * product;
const stockOf = ({ product, warehouse }) => ({
  available: 10 * product + warehouse.length,
  reserved: 1,
});
const pricing = defineEndpoints({
  linePrice: endpoint.value((_, params) => Promise.resolve(priceOf(params))),
  stock: endpoint.value((_, params) => Promise.resolve(stockOf(params))),
});
export const { defineForm, field } = createForms({ endpoints: [inventory, pricing] });

// The params of price: the product of its row and the price list of the
// header, undefined while either is missing.
export const byProduct = ({ product }, { values }) =>
  product === null || values.priceList === ""
    ? undefined
    : { product: product.value, list: values.priceList };
const priced = { query: { endpoint: "linePrice", params: byProduct } };

// An order with a price list, a note and a total in its header, and lines that
// ask for their price; each, lines, fields, rules and the rest of the
// configuration go over the defaults.
export const pricedOrder = ({
  each = {},
  lines = {},
  fields = {},
  rules = {},
  collections = {},
  ...form
} = {}) =>
  defineForm({
    ...form,
    fields: {
      priceList: field.text({ default: "retail" }),
      note: field.text(),
      total: field.number(),
      ...fields,
    },
    collections: {
      lines: {
        fields: {
          product: field.async("products"),
          warehouse: field.text(),
          lot: field.async("lots"),
          quantity: field.number({ default: 1 }),
          price: field.number(),
          amount: field.number(),
          ...lines,
        },
      },
      ...collections,
    },
    rules: {
      lines: {
        each: {
          lot: { params: lotParams },
          price: priced,
          amount: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
          ...each,
        },
      },
      ...rules,
    },
  });

// An order whose lot query asks for the lots of its row and runs patch; each
// goes over it.
export const lotPatched = (patch, each = {}) =>
  pricedOrder({
    each: {
      lot: { params: lotParams, query: { endpoint: "lots", params: lotParams, patch } },
      ...each,
    },
  });
// One whose lot query writes product 3 in its row, which changes the params of
// its price.
export const relabeled = (each) => lotPatched(() => ({ product: option(3) }), each);

// A session of the definition with the lines given, and the requests it made,
// as setup of rows-async.mjs gives them; asked names linePrice by default.
export const setup = (definition = pricedOrder()) => {
  const opened = opener(definition);
  // The requests of the price of a product in a list.
  const prices = (product, list = "retail") =>
    opened.calls.filter(({ key }) =>
      isDeepStrictEqual(key, ["trama", scope, "linePrice", { product, list }]),
    );
  return { ...opened, asked: (name = "linePrice") => opened.asked(name), prices };
};

// What a line has: some of its values and the status of its price.
export const lineOf = (line, ...names) => {
  const snapshot = line.getSnapshot();
  return [...names.map((name) => snapshot.values[name]), snapshot.queries.price.status];
};
export const statusOf = (line, name = "price") => line.getSnapshot().queries[name].status;
// The price of each line and its status.
export const pricesOf = (lines) => lines.map((line) => lineOf(line, "price"));
// Runs step on each item, one after another, as the tests settle requests in
// an order of their own.
export const inTurn = (items, step = (call) => call.resolve()) =>
  items.reduce(
    (previous, item, index) => previous.then(() => step(item, index)),
    Promise.resolve(),
  );
export const idle = { status: "idle", error: undefined };
export const pending = { status: "pending", error: undefined };

// Hands the outcomes of the requests given to the session in one task, in that
// order, once each load ran, so they form one batch: a call is answered with
// what its load gives, and a delivery, such as call.refusal(error), as it says.
export const together = async (...steps) => {
  const deliveries = await Promise.all(
    steps.map((step) => (typeof step === "function" ? step : step.ready())),
  );
  for (const deliver of deliveries) deliver();
  await settle();
};
// What read gives at each notification of the session.
export const heard = (session, read) => {
  const seen = [];
  session.subscribe(() => seen.push(read()));
  return seen;
};
