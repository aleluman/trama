import assert from "node:assert/strict";
import { test } from "node:test";
import { option, saved } from "./helpers/rows-async.mjs";
import {
  idle,
  inTurn,
  lineOf,
  handlesOf,
  pricedOrder,
  setup,
  statusOf,
} from "./helpers/rows-queries.mjs";
import { rejects } from "./helpers/session.mjs";

// Each query has a separate generation per row. Removal ends it and moving
// preserves it. Reset ends every generation, including for restored rows.
// Retry starts a new generation.

test("Two lines with the same query have separate generations, so each response leaves the other line's state unchanged", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(1)]);
  const [first, second] = handlesOf(session);
  const [one, two] = prices(1);
  assert.deepEqual([one.key, one.signal.aborted, two.signal.aborted], [two.key, false, false]);
  const kept = second.getSnapshot();
  await two.resolve();
  assert.deepEqual(lineOf(second, "price"), [100, "idle"]);
  assert.deepEqual(lineOf(first, "price"), [null, "pending"]);
  assert.notEqual(second.getSnapshot(), kept);
  const waiting = first.getSnapshot();
  await one.reject(new Error("No network"));
  assert.equal(statusOf(first), "error");
  assert.deepEqual(lineOf(second, "price"), [100, "idle"]);
  assert.notEqual(first.getSnapshot(), waiting);
});

// A total that rejects an order without lines.
const total = ({ lines }) => {
  if (lines.length === 0) throw new Error("Empty order");
  return lines.length;
};

test("Removing a line aborts its query on commit, so its response neither writes nor changes state, while a rejected remove leaves the request active", async () => {
  const { open, prices } = setup(pricedOrder({ rules: { total: { value: total } } }));
  const session = open([saved(1), saved(2)]);
  const [first, second] = handlesOf(session);
  rejects(
    session,
    () => session.remove("lines", [first.key, second.key]),
    'Field "total" value: formula failed: Empty order',
  );
  assert.deepEqual(
    [prices(1)[0].signal.aborted, statusOf(first), statusOf(second)],
    [false, "pending", "pending"],
  );
  session.remove("lines", [first.key]);
  assert.equal(prices(1)[0].signal.aborted, true);
  const published = [];
  const stop = session.subscribe(() => published.push(session.getSnapshot()));
  await prices(1)[0].resolve();
  await prices(2)[0].reject(new Error("late"));
  stop();
  // Only the second line, which stays, hears of its failure.
  assert.equal(published.length, 1);
  assert.equal(published[0].values, session.getSnapshot().values);
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ price }) => price),
    [null],
  );
  assert.equal(statusOf(second), "error");
  assert.equal(first.getSnapshot(), undefined);
});

test("Moving a line leaves its query untouched and the response writes to it by key", async () => {
  const { open, prices, calls } = setup();
  const session = open([saved(1), saved(2), saved(3)]);
  const [first, second, third] = handlesOf(session);
  session.move("lines", first.key, 2);
  session.move("lines", third.key, 0);
  assert.equal(calls.length, 3);
  assert.equal(prices(1)[0].signal.aborted, false);
  await prices(1)[0].resolve();
  await prices(3)[0].resolve();
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ price }) => price),
    [300, null, 100],
  );
  assert.deepEqual(
    [first, second, third].map((line) => statusOf(line)),
    ["idle", "pending", "idle"],
  );
});

test("After reset, the response is ignored even if the line returned, and baseline lines apply the opening rule", async () => {
  const { open, prices, calls } = setup();
  const session = open([saved(1), { ...saved(2), price: 250 }]);
  const [first, second] = handlesOf(session);
  second.edit("product", option(3));
  const [added] = session.add("lines", [saved(4)]);
  assert.equal(calls.length, 3);
  session.reset();
  // Every query is stopped, and the opening rule asks again for the first line only.
  assert.deepEqual(
    calls.slice(0, 3).map(({ signal }) => signal.aborted),
    [true, true, true],
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[3].key[3], { product: 1, list: "retail" });
  assert.deepEqual(
    [statusOf(first), statusOf(second), session.row("lines", first.key)],
    ["pending", "idle", first],
  );
  await inTurn(calls.slice(0, 3));
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ price }) => price),
    [null, 250],
  );
  assert.throws(() => session.row("lines", added));
  await prices(1)[1].resolve();
  assert.deepEqual(lineOf(first, "price"), [100, "idle"]);
  assert.deepEqual(lineOf(second, "price", "product"), [250, option(2), "idle"]);
});

test("retry starts a new generation with the same params even with one pending, so the previous generation stops writing and a suspended query makes no request", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), { ...saved(2), product: null }]);
  const [line, blank] = handlesOf(session);
  line.retry("price");
  const [old, renewed] = prices(1);
  assert.deepEqual([old.signal.aborted, renewed.key], [true, old.key]);
  await renewed.resolve();
  await old.resolve();
  assert.deepEqual(lineOf(line, "price"), [100, "idle"]);
  // After a failure, retry recovers it.
  line.edit("product", option(2));
  await prices(2)[0].reject(new Error("No network"));
  assert.equal(statusOf(line), "error");
  line.retry("price");
  assert.equal(statusOf(line), "pending");
  await prices(2)[1].resolve();
  assert.deepEqual(lineOf(line, "price"), [200, "idle"]);
  // Without params, retry does nothing.
  const before = blank.getSnapshot();
  blank.retry("price");
  assert.equal(blank.getSnapshot(), before);
  assert.deepEqual(blank.getSnapshot().queries.price, idle);
  assert.equal(prices(2).length, 2);
});

// Removes, moves and retries three of four lines, settles their requests in
// order, resolving the even ones and rejecting the odd ones, and resets.
const scenario = async (order) => {
  const { open, calls } = setup();
  const session = open([saved(1), saved(2), saved(3), saved(4)]);
  const [removed, moved, retried, kept] = handlesOf(session);
  session.remove("lines", [removed.key]);
  session.move("lines", moved.key, 2);
  retried.retry("price");
  const settled = calls.slice(0, 5);
  await inTurn(order, (index) =>
    index % 2 === 0
      ? settled[index].resolve()
      : settled[index].reject(new Error(`failure ${index}`)),
  );
  await settled[4].resolve();
  assert.equal(removed.getSnapshot(), undefined);
  assert.deepEqual(lineOf(moved, "price"), [null, "error"]);
  assert.equal(moved.getSnapshot().queries.price.error.message.endsWith("failure 1"), true);
  assert.deepEqual(lineOf(retried, "price"), [300, "idle"]);
  assert.equal(statusOf(kept), "error");
  session.reset();
  assert.deepEqual(
    handlesOf(session).map((line) => statusOf(line)),
    ["pending", "pending", "pending", "pending"],
  );
};

test("In the out-of-order matrix, responses and rejections for removed, moved, retried, and reset lines count only for their current generation", async () => {
  await inTurn(
    [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
    ],
    scenario,
  );
});
