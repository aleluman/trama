import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "trama-forms/core";
import { failNextPrice } from "../docs/site/examples/rows-async/api.ts";
import { initial, order } from "../docs/site/examples/rows-async/order.ts";
import { initial as pricedInitial, priced } from "../docs/site/examples/rows-async/priced.ts";
import { handlesOf } from "./helpers/rows-async.mjs";
import { heard, statusOf } from "./helpers/rows-queries.mjs";
import { opened, scriptedLoader, shown } from "./helpers/scripted-loader.mjs";

// The order from the “Async in rows” page, used to exercise the demo steps without React.
// Sessions ask through the scripted loader, a mock: each request waits until
// the test resolves it, and resolve() runs the endpoint's load against the
// simulated server of the example, with its wait.
const scope = "inventory";
const open = (definition = order, values = initial) => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(definition, { scope, loader, initial: values });
  const prices = () => calls.filter(({ key }) => key[2] === "linePrice");
  return { session, lines: handlesOf(session), calls, prices };
};
const labels = (view) => shown(view).labels;

test("A line's product field searches on the server and requests the next page", async () => {
  const { lines, calls } = open();
  const product = opened(lines[0], "product");
  product.search("screw");
  await calls.at(-1).resolve();
  assert.equal(labels(product).length, 8);
  assert.equal(product.getSnapshot().complete, false);
  product.more();
  await calls.at(-1).resolve();
  assert.deepEqual(labels(product).slice(8), ["Bench screw-cutting lathe", "Assorted screws"]);
  assert.equal(product.getSnapshot().complete, true);
  assert.deepEqual(calls.at(-1).key, ["trama", scope, "products", {}, "screw", 2]);
});

test("Each line requests lots for its product and warehouse, and changing warehouses affects only that line's lot", async () => {
  const { lines, calls } = open();
  const first = opened(lines[0], "lot");
  await calls.at(-1).resolve();
  assert.deepEqual(calls.at(-1).key, [
    "trama",
    scope,
    "lots",
    { product: "TOR-2", warehouse: "central" },
  ]);
  assert.equal(labels(first).length, 3);
  assert.match(labels(first)[0], /^C-\d+1 · expires 2027-0\d$/u);
  const kept = first.getSnapshot();
  const second = lines[1].list("lot");
  second.subscribe(() => {});
  lines[1].edit("lot", { value: "C-1", label: "C-1", expires: "2027-01" });
  lines[1].edit("warehouse", "north");
  assert.equal(lines[1].getSnapshot().values.lot, null, "the event of the warehouse clears it");
  second.open();
  assert.deepEqual(calls.at(-1).key[3], { product: "TUE-2", warehouse: "north" });
  assert.equal(first.getSnapshot(), kept);
  // Two views of the lot of the first line search apart, locally.
  const modal = opened(lines[0], "lot");
  await calls.at(-1).resolve();
  modal.search("802");
  assert.deepEqual(labels(modal), ["C-802 · expires 2027-06"]);
  assert.equal(labels(first).length, 3);
});

test("Removing the product clears the lot and suspends its list, and moving a line preserves its list", async () => {
  const { session, lines, calls } = open();
  const lot = opened(lines[0], "lot");
  lines[0].edit("product", null);
  assert.equal(lines[0].getSnapshot().values.lot, null);
  assert.equal(lot.getSnapshot().status, "suspended");
  const product = opened(lines[1], "product");
  product.search("lathe");
  const pending = calls.at(-1);
  session.move("lines", lines[0].key, 1);
  assert.equal(pending.signal.aborted, false);
  await pending.resolve();
  assert.equal(product.getSnapshot().text, "lathe");
  assert.deepEqual(labels(product), ["Bench screw-cutting lathe"]);
});

// The order from the “Queries per line” demo, with the failure switch of its
// simulated server.
const openPriced = () => open(priced, pricedInitial);
const screw = { value: "TOR-3", label: "Screw 4 × 20 mm", unit: "box" };
const nut = { value: "TUE-1", label: "Nut 3 × 10 mm", unit: "box" };

test("Row queries skip saved and duplicated lines, and a new line queries its price and selects its only lot", async () => {
  const { session, calls, prices } = openPriced();
  assert.equal(calls.length, 0);
  const [added] = session.add("lines", [{}]);
  const line = session.row("lines", added);
  line.edit("product", screw);
  assert.equal(statusOf(line), "pending");
  line.edit("warehouse", "port");
  await Promise.all(calls.map((call) => call.resolve()));
  assert.deepEqual(prices().at(-1).key[3], { product: "TOR-3", list: "general" });
  assert.equal(line.getSnapshot().values.price, 300);
  assert.equal(line.getSnapshot().values.lot.label, "P-811 · expires 2027-06");
  const before = calls.length;
  const [first] = handlesOf(session);
  const { values } = first.getSnapshot();
  session.add("lines", [values], { at: 1 });
  assert.equal(calls.length, before);
});

test("Row queries reprice all lines, handle removal, moves, and edits in flight, and support failure, retry, and discard", async () => {
  const { session, calls, prices } = openPriced();
  const [first, second] = handlesOf(session);
  const seen = heard(session, () => session.getSnapshot().values.lines.map(({ price }) => price));
  session.edit("priceList", "wholesale");
  assert.deepEqual(
    prices().map(({ key }) => key[3]),
    [
      { product: "TOR-2", list: "wholesale" },
      { product: "TUE-2", list: "wholesale" },
    ],
  );
  await Promise.all(prices().map((call) => call.resolve()));
  // The edit publishes once, and so do the answers, which the server gives together.
  assert.deepEqual(seen, [
    [200, 1000],
    [170, 850],
  ]);
  first.edit("product", nut);
  second.edit("product", screw);
  const [removed, moved] = prices().slice(-2);
  session.remove("lines", [first.key]);
  const [added] = session.add("lines", [{ product: nut }]);
  session.move("lines", second.key, 1);
  const edited = session.row("lines", added);
  edited.edit("price", 5);
  await Promise.all([removed.resolve(), moved.resolve(), prices().at(-1).resolve()]);
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ price }) => price),
    [5, 255],
  );
  failNextPrice();
  second.edit("product", nut);
  await prices().at(-1).resolve();
  assert.equal(statusOf(second), "error");
  assert.match(
    second.getSnapshot().queries.price.error.message,
    /The pricing server is not responding$/u,
  );
  second.retry("price");
  await prices().at(-1).resolve();
  assert.deepEqual([statusOf(second), second.getSnapshot().values.price], ["idle", 765]);
  const before = calls.length;
  session.reset();
  assert.equal(calls.length, before);
  assert.deepEqual(
    session.getSnapshot().values.lines.map(({ price }) => price),
    [200, 1000],
  );
});
