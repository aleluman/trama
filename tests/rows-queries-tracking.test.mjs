import assert from "node:assert/strict";
import { test } from "node:test";
import { option, saved } from "./helpers/rows-async.mjs";
import {
  field,
  idle,
  inTurn,
  handlesOf,
  pending,
  pricedOrder,
  setup,
  statusOf,
} from "./helpers/rows-queries.mjs";

// Each row handle exposes its query state with stable identity until it
// changes. Tracking follows the changes of the current operation.

// An order whose price params count their runs.
const counted = () => {
  const runs = [];
  const params = (row, { key, values }) => {
    runs.push(key);
    return row.product === null
      ? undefined
      : { product: row.product.value, list: values.priceList };
  };
  return {
    runs,
    definition: pricedOrder({ each: { price: { query: { endpoint: "linePrice", params } } } }),
  };
};

// With lines of saved prices, editing the product of the last one runs its
// params alone and asks once; edits its params do not read run nothing.
const proportional = async (size) => {
  const { runs, definition } = counted();
  const { open, calls } = setup(definition);
  const lines = Array.from({ length: size }, (_, index) => ({
    ...saved(1 + (index % 4)),
    price: 1,
  }));
  const session = open(lines);
  assert.deepEqual([runs.length, calls.length], [size, 0]);
  const line = session.row("lines", session.getSnapshot().rows.lines[size - 1]);
  runs.length = 0;
  line.edit("product", option(5));
  assert.deepEqual([runs, calls.length], [[line.key], 1]);
  runs.length = 0;
  line.edit("quantity", 4);
  session.edit("note", "Another");
  assert.deepEqual([runs, calls.length], [[], 1]);
  await calls[0].resolve();
  assert.deepEqual([runs, calls.length, line.getSnapshot().values.price], [[], 1, 500]);
};

test("With 10 and 100 lines with idle queries, editing one line runs its params and makes one request", async () => {
  await inTurn([10, 100], proportional);
});

test("A no-op command does not replay the previous operation and neither stops nor repeats queries", () => {
  const { open, calls } = setup();
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  line.edit("price", 5);
  line.retry("price");
  assert.equal(statusOf(line), "pending");
  // Edits without difference publish the state in force again.
  line.edit("price", 5);
  session.edit("note", "");
  assert.deepEqual([statusOf(line), calls.at(-1).signal.aborted], ["pending", false]);
  const [added] = session.add("lines", [saved(2)]);
  assert.equal(calls.length, 3);
  session.row("lines", added).edit("warehouse", "north");
  session.patch({});
  assert.equal(calls.length, 3);
});

test("The handle publishes frozen query states for its row and preserves the identity of the record and each state while unchanged", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2)]);
  const [first, second] = handlesOf(session);
  const { queries } = first.getSnapshot();
  assert.ok(Object.isFrozen(queries));
  assert.deepEqual(Object.keys(queries), ["price"]);
  const kept = { snapshot: first.getSnapshot(), queries, state: queries.price };
  await prices(2)[0].resolve();
  session.edit("note", "Another");
  assert.equal(first.getSnapshot().queries, kept.queries);
  assert.equal(first.getSnapshot().queries.price, kept.state);
  // The values of the row did not change either, nor its snapshot.
  session.edit("note", "More");
  assert.notEqual(second.getSnapshot().queries, queries);
  assert.equal(first.getSnapshot().queries, kept.queries);
  await prices(1)[0].resolve();
  assert.notEqual(first.getSnapshot().queries, kept.queries);
  assert.deepEqual(first.getSnapshot().queries, { price: idle });
});

test("Rows whose queries are all pending or all idle share their state object", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2), { ...saved(3), price: 1 }]);
  const [first, second, third] = handlesOf(session).map((line) => () => line.getSnapshot().queries);
  assert.deepEqual([first(), third()], [{ price: pending }, { price: idle }]);
  assert.equal(second(), first());
  await prices(1)[0].resolve();
  assert.equal(first(), third());
  await prices(2)[0].resolve();
  assert.equal(second(), third());
});

test("A row whose collection declares no queries always publishes the same frozen {}", () => {
  const definition = pricedOrder({
    collections: { notes: { fields: { text: field.text() } } },
  });
  const { open } = setup(definition);
  const session = open([saved(1)], { notes: [{ text: "a" }, { text: "b" }] });
  const [one, two] = handlesOf(session, "notes");
  const empty = one.getSnapshot().queries;
  assert.deepEqual(empty, {});
  assert.ok(Object.isFrozen(empty));
  assert.equal(two.getSnapshot().queries, empty);
  one.edit("text", "c");
  assert.equal(one.getSnapshot().queries, empty);
  assert.throws(() => one.retry("text"), { message: 'Field "text" of "notes" has no query' });
});

test("A change only to a row's query state notifies subscribers without changing the session snapshot", async () => {
  const { open, prices } = setup();
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  const before = session.getSnapshot();
  const heard = [];
  const stop = session.subscribe(() => heard.push(statusOf(line)));
  await prices(1)[0].reject(new Error("No network"));
  line.retry("price");
  stop();
  assert.deepEqual(heard, ["error", "pending"]);
  assert.equal(session.getSnapshot(), before);
});
