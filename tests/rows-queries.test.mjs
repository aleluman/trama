import assert from "node:assert/strict";
import { test } from "node:test";
import { declareContext } from "trama-forms/core";
import { lotsOf, option, saved } from "./helpers/rows-async.mjs";
import {
  idle,
  inTurn,
  lineOf,
  handlesOf,
  pending,
  pricedOrder,
  setup,
  statusOf,
} from "./helpers/rows-queries.mjs";

// Row queries cover when a line requests its price, what its patch receives,
// and when a late response is discarded.

test("Opening queries lines with no price in initial and skips those with a supplied price, even null", async () => {
  const { open, calls, prices } = setup();
  const session = open([{ ...saved(1), price: 120 }, saved(2), { ...saved(3), price: null }]);
  const [first, second, third] = handlesOf(session);
  assert.deepEqual(
    calls.map(({ key }) => key[3]),
    [{ product: 2, list: "retail" }],
  );
  assert.deepEqual(
    [first, second, third].map((line) => line.getSnapshot().queries.price),
    [idle, pending, idle],
  );
  await prices(2)[0].resolve();
  assert.deepEqual(lineOf(second, "price", "amount"), [200, 200, "idle"]);
  assert.deepEqual(lineOf(first, "price", "amount"), [120, 120, "idle"]);
  // Edits that keep the params ask for nothing.
  first.edit("quantity", 3);
  session.edit("note", "Another");
  assert.equal(calls.length, 1);
  // A line without product has its params undefined: it asks once it has one.
  const [blank] = session.add("lines", [{ warehouse: "north" }]);
  const line = session.row("lines", blank);
  assert.deepEqual([calls.length, statusOf(line)], [1, "idle"]);
  line.edit("product", option(4));
  assert.deepEqual([prices(4).length, statusOf(line)], [1, "pending"]);
});

test("add queries only when the price is omitted, and duplicating a line with its price does not request it again", async () => {
  const { open, calls, prices } = setup();
  const session = open([{ ...saved(1), price: 120 }]);
  const [original] = handlesOf(session);
  const { amount: _amount, ...copy } = original.getSnapshot().values;
  const [duplicate, fresh] = session.add("lines", [copy, saved(1)], { at: 1 });
  assert.deepEqual(lineOf(session.row("lines", duplicate), "price", "amount"), [120, 120, "idle"]);
  assert.deepEqual(lineOf(session.row("lines", fresh), "price"), [null, "pending"]);
  assert.equal(calls.length, 1);
  await prices(1)[0].resolve();
  assert.deepEqual(lineOf(session.row("lines", fresh), "price", "amount"), [100, 100, "idle"]);
  assert.deepEqual(lineOf(session.row("lines", duplicate), "price"), [120, "idle"]);
});

test("Changing the header price list requotes every line with its own params", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2)], { priceList: "wholesale" });
  await prices(1, "wholesale")[0].resolve();
  await prices(2, "wholesale")[0].resolve();
  session.edit("priceList", "retail");
  const lines = handlesOf(session);
  assert.deepEqual(
    lines.map((line) => statusOf(line)),
    ["pending", "pending"],
  );
  await prices(2)[0].resolve();
  await prices(1)[0].resolve();
  assert.deepEqual(
    lines.map((line) => lineOf(line, "price")),
    [
      [100, "idle"],
      [200, "idle"],
    ],
  );
});

test("The patch receives the result, row, and values from the latest publication, plus the key and context, frozen and without peek or toDefaults", async () => {
  const seen = [];
  const patch = (result, tools) => {
    seen.push({
      result,
      tools,
      frozen: Object.isFrozen(tools.row) && Object.isFrozen(tools.values),
    });
    return { price: result + tools.context.surcharge, quantity: tools.row.quantity + 1 };
  };
  const definition = pricedOrder({
    context: declareContext(),
    each: {
      price: {
        query: {
          endpoint: "linePrice",
          params: ({ product }) => product && { product: product.value, list: "retail" },
          patch,
        },
      },
    },
  });
  const { open, prices } = setup(definition);
  const session = open([saved(2)], { note: "Order" }, { surcharge: 5 });
  const [line] = handlesOf(session);
  line.edit("warehouse", "south");
  await prices(2)[0].resolve();
  const [{ result, tools, frozen }] = seen;
  assert.equal(result, 200);
  assert.deepEqual(Object.keys(tools).toSorted(), ["context", "key", "row", "values"]);
  assert.equal(tools.key, line.key);
  assert.equal(tools.row.warehouse, "south");
  assert.equal(tools.values.note, "Order");
  assert.equal(tools.values.lines[0].warehouse, "south");
  assert.ok(frozen);
  assert.deepEqual(lineOf(line, "price", "quantity", "amount"), [205, 2, 410, "idle"]);
});

test("A row patch that names a header field puts the query in error without writing anything", async () => {
  const definition = pricedOrder({
    each: {
      price: {
        query: {
          endpoint: "linePrice",
          params: ({ product }) => product && { product: product.value, list: "x" },
          patch: (price) => ({ price, total: price }),
        },
      },
    },
  });
  const { open, calls } = setup(definition);
  const session = open([saved(2)]);
  const [line] = handlesOf(session);
  const before = session.getSnapshot();
  await calls[0].resolve();
  assert.equal(session.getSnapshot().values, before.values);
  const { status, error } = line.getSnapshot().queries.price;
  assert.equal(status, "error");
  assert.equal(
    error.message,
    `Field "price" of "lines" row "${line.key}" query: unknown field "total" in patch`,
  );
});

// The first lot alone, as a server that has one for the product.
const single = (lots) => lots.slice(0, 1);

test("A sole lot is automatically selected in its row, with no replacement of an existing selection and no choice between two lots", async () => {
  const definition = pricedOrder({
    each: {
      lot: {
        params: ({ product, warehouse }) =>
          product === null ? undefined : { product: product.value, warehouse },
        query: {
          endpoint: "lots",
          params: ({ product, warehouse }) =>
            product === null ? undefined : { product: product.value, warehouse },
          patch: (lots, { row }) => {
            const found = row.warehouse === "south" ? lots : single(lots);
            return row.lot === null && found.length === 1 ? { lot: found[0] } : undefined;
          },
        },
      },
    },
  });
  const { open, asked } = setup(definition);
  const chosen = lotsOf({ product: 3, warehouse: "north" })[1];
  const session = open([
    saved(1),
    { ...saved(2), lot: null, price: 1 },
    { ...saved(3), lot: chosen },
  ]);
  // The second line supplied lot as null, so it does not ask at opening.
  assert.deepEqual(
    asked("lots").map(({ key }) => key[3].product),
    [1],
  );
  const [first, second, third] = handlesOf(session);
  second.edit("warehouse", "south");
  third.edit("warehouse", "east");
  await Promise.all(asked("lots").map((call) => call.resolve()));
  assert.deepEqual(first.getSnapshot().values.lot, lotsOf({ product: 1, warehouse: "north" })[0]);
  assert.equal(second.getSnapshot().values.lot, null);
  const kept = third.getSnapshot().values.lot;
  assert.deepEqual(kept, chosen);
  assert.deepEqual(
    [first, second, third].map((line) => statusOf(line, "lot")),
    ["idle", "idle", "idle"],
  );
});

test("A late row query response preserves an edit and is discarded if its params change or are cleared", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2), saved(3)]);
  const [edited, changed, emptied] = handlesOf(session);
  edited.edit("price", 777);
  changed.edit("product", option(4));
  emptied.edit("product", null);
  assert.deepEqual(
    [edited, changed, emptied].map((line) => statusOf(line)),
    ["idle", "pending", "idle"],
  );
  assert.deepEqual(
    [1, 2, 3].map((product) => prices(product)[0].signal.aborted),
    [true, true, true],
  );
  await inTurn([1, 2, 3, 4], (product) => prices(product)[0].resolve());
  assert.deepEqual(lineOf(edited, "price", "amount"), [777, 777, "idle"]);
  assert.deepEqual(lineOf(changed, "price", "amount"), [400, 400, "idle"]);
  assert.deepEqual(lineOf(emptied, "price", "amount"), [null, 0, "idle"]);
});
