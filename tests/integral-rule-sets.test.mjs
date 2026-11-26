import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "trama-forms/core";
import { sale } from "../docs/site/examples/rule-sets/fields.ts";
import { initial, order, quote, variant } from "../docs/site/examples/rule-sets/forms.ts";
import { lots, sent, sentLock } from "../docs/site/examples/rule-sets/rules.ts";
import { defineForm } from "../docs/site/forms.ts";
import { handlesOf } from "./helpers/rows-async.mjs";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

// The “Rule sets” page, exercising its demo steps without React. Sessions
// ask through the scripted loader, a mock: each request waits until the test
// resolves it, and resolve() runs the endpoint's load against the simulated
// server of the example, with its wait.
const scope = "inventory";
const open = (definition, context) => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(definition, { scope, loader, initial, context });
  return { session, line: handlesOf(session)[0], calls };
};
const amountOf = (line) => line.getSnapshot().values.amount;

test("The order and quote share a line, and only the quote applies the discount", async () => {
  const ordered = open(order, { sent: false });
  const quoted = open(quote);
  assert.deepEqual([amountOf(ordered.line), amountOf(quoted.line)], [800, 720]);
  for (const { line } of [ordered, quoted]) line.edit("quantity", 5);
  assert.deepEqual([amountOf(ordered.line), amountOf(quoted.line)], [1000, 900]);
  assert.deepEqual(
    [ordered.session, quoted.session].map((session) => session.getSnapshot().values.total),
    [1000, 900],
  );
  // Another price list asks for the price of the line again, only in the order.
  ordered.session.edit("priceList", "wholesale");
  assert.deepEqual(
    ordered.calls.map(({ key }) => key[2]),
    ["linePrice"],
  );
  await ordered.calls[0].resolve();
  assert.deepEqual([ordered.line.getSnapshot().values.price, amountOf(ordered.line)], [170, 850]);
  assert.deepEqual([quoted.calls.length, amountOf(quoted.line)], [0, 900]);
});

test("The order's inline rule hides the lot when the product is missing, and the quote keeps it visible", () => {
  const ordered = open(order, { sent: false });
  const quoted = open(quote);
  for (const { line } of [ordered, quoted]) line.edit("product", null);
  assert.deepEqual(
    [ordered, quoted].map(({ line }) => line.getSnapshot().fieldStates.lot.hidden),
    [true, false],
  );
  // The event of lots clears the lot of a line whose product changes.
  assert.equal(quoted.line.getSnapshot().values.lot, null);
});

test("A sent order disables notes and makes quantity read-only", () => {
  const { session, line } = open(order, { sent: true });
  const { notes } = session.getSnapshot().fieldStates;
  assert.deepEqual([notes.disabled, notes.reasons], [true, ["Sent"]]);
  assert.deepEqual(line.getSnapshot().fieldStates.quantity.reasons, ["Sent"]);
  const draft = open(order, { sent: false });
  assert.equal(draft.session.getSnapshot().fieldStates.notes.disabled, false);
});

test("The lots variant selects Port's only lot, and the lotParamsOnly variant leaves it empty", async () => {
  const automatic = open(variant(true));
  const manual = open(variant(false));
  for (const { line } of [automatic, manual]) {
    line.edit("warehouse", "port");
    assert.equal(line.getSnapshot().values.lot, null);
  }
  assert.deepEqual(automatic.calls.at(-1).key.slice(2), [
    "lots",
    { product: "TOR-2", warehouse: "port" },
  ]);
  await automatic.calls.at(-1).resolve();
  assert.ok(automatic.line.getSnapshot().values.lot.value.startsWith("P-"));
  // Without the query of lots, nothing asks: the lot stays empty.
  assert.deepEqual([manual.calls.length, manual.line.getSnapshot().values.lot], [0, null]);
  // Each choice is another definition, with queries of its own.
  assert.notEqual(variant(true), variant(true));
});

test("Including sentLock twice throws a duplicate error with context and parameters supplied", () => {
  assert.throws(() => defineForm({ ...sale, context: sent, include: [lots, sentLock, sentLock] }), {
    message: "Form include[2]: repeats the rule set of include[1]",
  });
  // The same sets once each define the form.
  assert.ok(defineForm({ ...sale, context: sent, include: [lots, sentLock] }));
});
