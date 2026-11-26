import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "trama-forms/core";
import { field, handlesOf, lotsOf, option, orderOf, scope, setup } from "./helpers/rows-async.mjs";
import { opened, scriptedLoader, shown, watch } from "./helpers/scripted-loader.mjs";

const paramsOf = (requests) => requests.map(({ key }) => key[3]);
const labels = (options) => options.map((item) => item.label);

test("Each row requests its lot with its own params, and the key excludes the row", async () => {
  const { open, asked } = setup();
  const session = open([
    { product: option(1), warehouse: "north" },
    { product: option(3), warehouse: "south" },
  ]);
  const [first, second] = handlesOf(session);
  const views = [opened(first, "lot"), opened(second, "lot")];
  assert.deepEqual(
    asked("lots").map(({ key }) => key),
    [
      ["trama", scope, "lots", { product: 1, warehouse: "north" }],
      ["trama", scope, "lots", { product: 3, warehouse: "south" }],
    ],
  );
  await Promise.all(asked("lots").map((request) => request.resolve()));
  assert.deepEqual(
    views.map((view) => labels(view.getSnapshot().options)),
    [
      labels(lotsOf({ product: 1, warehouse: "north" })),
      labels(lotsOf({ product: 3, warehouse: "south" })),
    ],
  );
  // The options of the view are those of the endpoint, with their data.
  assert.deepEqual(views[0].getSnapshot().options, lotsOf({ product: 1, warehouse: "north" }));
});

test("Changing a row's warehouse synchronizes only that row's list", async () => {
  const { open, asked } = setup();
  const session = open([
    { product: option(1), warehouse: "north" },
    { product: option(1), warehouse: "north" },
  ]);
  const [first, second] = handlesOf(session);
  const watched = [watch(first, "lot"), watch(second, "lot")];
  for (const { view } of watched) view.open();
  await Promise.all(asked("lots").map((request) => request.resolve()));
  const kept = watched[1].view.getSnapshot();
  const heard = watched.map((watching) => watching.notifications);
  second.edit("quantity", 4);
  first.edit("warehouse", "south");
  assert.deepEqual(paramsOf(asked("lots")), [
    { product: 1, warehouse: "north" },
    { product: 1, warehouse: "north" },
    { product: 1, warehouse: "south" },
  ]);
  assert.equal(watched[0].view.getSnapshot().status, "loading");
  assert.equal(watched[1].view.getSnapshot(), kept);
  assert.equal(watched[1].notifications, heard[1]);
  // Clearing the product suspends only the list of its row.
  first.edit("product", null);
  assert.deepEqual(shown(watched[0].view), {
    status: "suspended",
    text: "",
    labels: [],
    complete: false,
    error: undefined,
  });
  assert.equal(watched[0].view.getSnapshot().options.length, 0);
  assert.equal(watched[1].view.getSnapshot(), kept);
  assert.ok(asked("lots")[2].signal.aborted, "the request in flight is dropped");
});

test("Two lists for the same row search independently and each call to list creates a new one", async () => {
  const { open, asked } = setup();
  const session = open([{}]);
  const [line] = handlesOf(session);
  const table = opened(line, "product");
  const modal = opened(line, "product");
  assert.notEqual(table, modal);
  modal.search("screw");
  assert.deepEqual(
    asked("products").map(({ key }) => key),
    [
      ["trama", scope, "products", {}, "", 1],
      ["trama", scope, "products", {}, "", 1],
      ["trama", scope, "products", {}, "screw", 1],
    ],
  );
  assert.ok(asked("products")[1].signal.aborted, "the search drops the open of its own view");
  assert.ok(!asked("products")[0].signal.aborted);
  await Promise.all(asked("products").map((request) => request.resolve()));
  assert.deepEqual(shown(table).labels, ["Screw", "Long screw"]);
  assert.deepEqual(shown(modal), {
    status: "ready",
    text: "screw",
    labels: ["Screw", "Long screw"],
    complete: false,
    error: undefined,
  });
  modal.more();
  await asked("products").at(-1).resolve();
  assert.deepEqual(shown(modal).labels, ["Screw", "Long screw", "Screw-cutting lathe"]);
  assert.equal(shown(modal).complete, true);
  assert.equal(shown(table).text, "");
  // A list never writes to the session.
  assert.deepEqual(line.getSnapshot().values.product, null);
});

test("A row option list supports retry and local search and reports errors with the row label", async () => {
  const { open, asked } = setup();
  const session = open([{ product: option(1), warehouse: "north" }]);
  const [line] = handlesOf(session);
  const lot = opened(line, "lot");
  const boom = new Error("down");
  await asked("lots")[0].reject(boom);
  const { error } = lot.getSnapshot();
  assert.equal(
    error.message,
    `Field "lot" of "lines" row "${line.key}" list: request failed: down`,
  );
  assert.equal(error.cause, boom);
  lot.retry();
  await asked("lots")[1].resolve();
  assert.equal(shown(lot).status, "ready");
  // A whole list searches locally.
  lot.search("LOT 2");
  assert.deepEqual(shown(lot).labels, ["Lot 2 of 1 in north"]);
  assert.equal(asked("lots").length, 2);
  assert.throws(() => lot.search(5), {
    name: "TypeError",
    message: `Field "lot" of "lines" row "${line.key}" list: search text must be a string`,
  });
});

test("An async row field with no params rule requests with {}, even in an added row", async () => {
  const { open, asked } = setup();
  const session = open([{}]);
  const [added] = session.add("lines", [{}]);
  const view = opened(session.row("lines", added), "product");
  assert.deepEqual(paramsOf(asked("products")), [{}]);
  await asked("products")[0].resolve();
  assert.deepEqual(shown(view).labels, ["Screw", "Long screw"]);
});

test("A header field list keeps its messages", async () => {
  const { loader, calls } = scriptedLoader();
  const definition = orderOf({ fields: { customer: field.async("products") } });
  const session = createSession(definition, { scope, loader });
  const view = session.list("customer");
  view.subscribe(() => {});
  view.open();
  await calls[0].reject(new Error("down"));
  assert.equal(view.getSnapshot().error.message, 'Field "customer" list: request failed: down');
});
