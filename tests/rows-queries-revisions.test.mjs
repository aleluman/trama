import assert from "node:assert/strict";
import { test } from "node:test";
import { saved } from "./helpers/rows-async.mjs";
import {
  field,
  inTurn,
  lineOf,
  handlesOf,
  pricedOrder,
  setup,
  statusOf,
} from "./helpers/rows-queries.mjs";

// Revisions are tracked by address. The revision check discards the entire
// response exactly when a destination in its row changed after the request
// started, regardless of the writer.

// The quote of a line writes its price and a discount, which its params do
// not read; patch writes them, and rules go over the others.
const quotedOrder = ({ patch = (price) => ({ price, discount: price / 10 }), ...form } = {}) =>
  pricedOrder({
    lines: { discount: field.number() },
    ...form,
    each: {
      price: {
        query: {
          endpoint: "linePrice",
          params: ({ product }) => product && { product: product.value, list: "retail" },
          patch,
        },
      },
      ...form.each,
    },
  });
// The promotion of the header writes the discount of every line.
const promotion = {
  onChange: ({ promotion: value }, { rows }) =>
    value === null
      ? undefined
      : { lines: Object.fromEntries(rows.lines.map((key) => [key, { discount: value }])) },
};

test("A handle edit, session patch, or header event that writes a row destination discards the whole response", async () => {
  const { open, calls } = setup(
    quotedOrder({ fields: { promotion: field.number() }, rules: { promotion } }),
  );
  const session = open([saved(1), saved(2), saved(3), saved(4)]);
  const [untouched, edited, patched, evented] = handlesOf(session);
  edited.edit("discount", 1);
  session.patch({ lines: { [patched.key]: { discount: 2 } } });
  assert.deepEqual(
    [untouched, edited, patched].map((line) => statusOf(line)),
    ["pending", "pending", "pending"],
  );
  await inTurn(calls.slice(0, 3));
  assert.deepEqual(lineOf(untouched, "price", "discount"), [100, 10, "idle"]);
  assert.deepEqual(lineOf(edited, "price", "discount"), [null, 1, "idle"]);
  assert.deepEqual(lineOf(patched, "price", "discount"), [null, 2, "idle"]);
  // The event writes the discount of every line, the fourth among them.
  session.edit("promotion", 7);
  await calls[3].resolve();
  assert.deepEqual(lineOf(evented, "price", "discount"), [null, 7, "idle"]);
});

test("Writing the same field in another row preserves the response, and restoring the initial value discards it", async () => {
  const { open, calls } = setup(quotedOrder());
  const session = open([saved(1), saved(2), saved(3)]);
  const [neighbour, target, returned] = handlesOf(session);
  neighbour.edit("discount", 5);
  returned.edit("discount", 5);
  returned.edit("discount", null);
  await calls[1].resolve();
  await calls[2].resolve();
  assert.deepEqual(lineOf(target, "price", "discount"), [200, 20, "idle"]);
  assert.deepEqual(lineOf(returned, "price", "discount"), [null, null, "idle"]);
  // The neighbour edited its own discount, which discards its own response.
  await calls[0].resolve();
  assert.deepEqual(lineOf(neighbour, "price", "discount"), [null, 5, "idle"]);
});

test("A header write with the same name as a row destination preserves the row's response", async () => {
  const { open, calls } = setup(
    quotedOrder({
      fields: { discount: field.number() },
      patch: (price) => ({ price, discount: 3 }),
    }),
  );
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  session.edit("discount", 9);
  await calls[0].resolve();
  assert.deepEqual(lineOf(line, "price", "discount"), [100, 3, "idle"]);
  assert.equal(session.getSnapshot().values.discount, 9);
});

test("A response arriving after a rejected operation still applies because the rejection leaves revisions unchanged", async () => {
  const strict = {
    onChange: ({ discount }) => {
      if (discount === 99) throw new Error("Invalid discount");
    },
  };
  const { open, calls } = setup(
    quotedOrder({ each: { discount: strict }, patch: (price) => ({ price, discount: 1 }) }),
  );
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  assert.throws(() => line.edit("discount", 99), {
    message: `Field "discount" of "lines" row "${line.key}" onChange: event failed: Invalid discount`,
  });
  await calls[0].resolve();
  assert.deepEqual(lineOf(line, "price", "discount"), [100, 1, "idle"]);
});
