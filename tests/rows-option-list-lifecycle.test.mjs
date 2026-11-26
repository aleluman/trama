import assert from "node:assert/strict";
import { test } from "node:test";
import { handlesOf, lotParams, orderOf, removedRow, saved, setup } from "./helpers/rows-async.mjs";
import { opened, shown, watch } from "./helpers/scripted-loader.mjs";
import { keysOf, rejects } from "./helpers/session.mjs";

const statusOf = (view) => view.getSnapshot().status;

test("Removing a row suspends its subscribed list and aborts its request while another row stays unchanged", async () => {
  const { open, asked } = setup();
  const session = open([saved(), saved(3)]);
  const [first, second] = handlesOf(session);
  const lot = opened(first, "lot");
  const other = opened(second, "lot");
  await asked("lots")[1].resolve();
  const kept = other.getSnapshot();
  lot.search("2");
  session.remove("lines", [first.key]);
  assert.deepEqual(shown(lot), {
    status: "suspended",
    text: "2",
    labels: [],
    complete: false,
    error: undefined,
  });
  assert.ok(asked("lots")[0].signal.aborted);
  assert.equal(other.getSnapshot(), kept);
  // A response that arrives later changes nothing.
  await asked("lots")[0].resolve();
  assert.equal(statusOf(lot), "suspended");
  assert.equal(asked("lots").length, 2);
});

test("A reset that restores the row returns its list to idle or reloads it if it was open", async () => {
  const { open, asked } = setup();
  const session = open([saved(), saved(3)]);
  const [first, second] = handlesOf(session);
  const lot = opened(first, "lot");
  const closed = watch(second, "lot").view;
  session.remove("lines", [first.key, second.key]);
  assert.deepEqual([statusOf(lot), statusOf(closed)], ["suspended", "suspended"]);
  session.reset();
  assert.deepEqual([statusOf(lot), statusOf(closed)], ["loading", "idle"]);
  assert.deepEqual(asked("lots").at(-1).key[3], { product: 1, warehouse: "north" });
  await asked("lots").at(-1).resolve();
  assert.equal(statusOf(lot), "ready");
  // The handles are the same, and they keep creating lists.
  assert.equal(session.row("lines", first.key), first);
  assert.equal(statusOf(first.list("lot")), "idle");
});

test("Reset leaves the list of a row added after opening suspended", () => {
  const { open } = setup();
  const session = open([saved()]);
  const [added] = session.add("lines", [saved(3)]);
  const line = session.row("lines", added);
  const lot = opened(line, "lot");
  assert.equal(statusOf(lot), "loading");
  session.reset();
  assert.equal(statusOf(lot), "suspended");
  assert.equal(line.getSnapshot(), undefined);
  assert.throws(() => line.list("lot"), { message: removedRow(added) });
});

test("A list with no subscribers synchronizes when subscribed to again", () => {
  const { open, asked } = setup();
  const session = open([saved()]);
  const [line] = handlesOf(session);
  const watching = watch(line, "lot");
  watching.view.open();
  watching.stop();
  assert.ok(asked("lots")[0].signal.aborted, "the last subscriber leaving drops the request");
  line.edit("warehouse", "south");
  session.remove("lines", [line.key]);
  assert.equal(asked("lots").length, 1);
  const stop = watching.view.subscribe(() => {});
  assert.equal(statusOf(watching.view), "suspended");
  stop();
  session.reset();
  watching.view.subscribe(() => {});
  assert.equal(statusOf(watching.view), "loading");
  assert.deepEqual(asked("lots").at(-1).key[3], { product: 1, warehouse: "north" });
});

test("Moving a row leaves its list unchanged, retaining its attempt and text", async () => {
  const { open, asked } = setup();
  const session = open([saved(), saved(3)]);
  const [first] = handlesOf(session);
  const product = opened(first, "product");
  product.search("screw");
  const before = product.getSnapshot();
  session.move("lines", first.key, 1);
  assert.equal(product.getSnapshot(), before);
  assert.equal(asked("products").length, 2);
  assert.ok(!asked("products")[1].signal.aborted);
  await asked("products")[1].resolve();
  assert.deepEqual(shown(product).labels, ["Screw", "Long screw"]);
});

test("handle.list checks the row, field, and field type in that order and bypasses the guard", () => {
  const { open } = setup();
  const session = open([saved(), saved()]);
  const [first, second] = handlesOf(session);
  for (const [name, type] of [
    ["warehouse", "text"],
    ["quantity", "number"],
  ])
    rejects(
      session,
      () => first.list(name),
      `Field "${name}" of "lines" (${type}) has no option list`,
    );
  for (const name of ["nope", "toString", "__proto__"])
    rejects(session, () => first.list(name), `Collection "lines": unknown field "${name}"`);
  session.remove("lines", [first.key]);
  for (const name of ["lot", "quantity", "nope"])
    rejects(session, () => first.list(name), removedRow(first.key));
  // A list can be created while the session notifies.
  let created;
  const stop = session.subscribe(() => {
    created ??= second.list("lot");
  });
  second.edit("quantity", 2);
  stop();
  assert.equal(statusOf(created), "idle");
});

test("A field with no params rule uses {} in an added row and in a row restored by reset", () => {
  const { open, asked } = setup();
  const session = open([saved()]);
  const [line] = handlesOf(session);
  const product = opened(line, "product");
  session.remove("lines", [line.key]);
  assert.equal(statusOf(product), "suspended");
  session.reset();
  assert.equal(statusOf(product), "loading");
  const [added] = session.add("lines", [{}]);
  opened(session.row("lines", added), "product");
  assert.deepEqual(
    asked("products").map(({ key }) => key[3]),
    [{}, {}, {}],
  );
});

// The note of the header fails without two lines, and its hidden state when a
// line is in the warehouse "broken", after the params of the rows; the params of
// lot fail while failing is set.
let failing = false;
const fragile = orderOf({
  rules: {
    note: {
      value: ({ lines }) => {
        if (lines.length === 1) throw new Error("Only one line remains");
        return lines.map((line) => line.warehouse).join();
      },
      hidden: ({ lines }) => {
        if (lines.some((line) => line.warehouse === "broken")) throw new Error("Broken warehouse");
        return false;
      },
    },
    lines: {
      each: {
        lot: {
          params: (row) => {
            if (failing) throw new Error("No params");
            return lotParams(row);
          },
        },
      },
    },
  },
});

test("A rejected remove, edit, or reset preserves params, attempts, and dependencies", async () => {
  const { open, asked } = setup(fragile);
  const session = open([saved(), saved(3)]);
  const [first, second] = handlesOf(session);
  const lot = opened(first, "lot");
  const before = lot.getSnapshot();
  rejects(
    session,
    () => session.remove("lines", [second.key]),
    'Field "note" value: formula failed: Only one line remains',
  );
  failing = true;
  const message = `Field "lot" of "lines" row "${first.key}" params: formula failed: No params`;
  rejects(session, () => first.edit("warehouse", "south"), message);
  rejects(session, () => session.reset(), message);
  failing = false;
  rejects(
    session,
    () => first.edit("warehouse", "broken"),
    'Field "note" hidden: formula failed: Broken warehouse',
  );
  // An operation that publishes afterwards finds the params of before.
  first.edit("quantity", 3);
  assert.equal(lot.getSnapshot(), before);
  assert.equal(asked("lots").length, 1);
  assert.ok(!asked("lots")[0].signal.aborted);
  // Its params and their dependencies are those of before.
  await asked("lots")[0].resolve();
  assert.equal(statusOf(lot), "ready");
  first.edit("warehouse", "south");
  assert.deepEqual(asked("lots").at(-1).key[3], { product: 1, warehouse: "south" });
  assert.deepEqual(keysOf(session), [first.key, second.key]);
});
