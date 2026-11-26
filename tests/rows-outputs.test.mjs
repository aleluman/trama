import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs } from "./helpers/session.mjs";

const keys = (session) => session.getSnapshot().rows.lines;
const line = {
  name: field.text(),
  quantity: field.number({ default: 1 }),
  price: field.number({ default: 0 }),
};
// Two lines, a header note, and the outputs given.
const open = (outputs) =>
  createSession(
    defineForm({
      fields: { note: field.text() },
      collections: { lines: { fields: line } },
      outputs,
    }),
    {
      initial: {
        lines: [
          { name: "a", price: 10 },
          { name: "b", quantity: 2, price: 5 },
        ],
      },
    },
  );
const amountOf = (lines) => lines.reduce((sum, row) => sum + row.quantity * row.price, 0);

test("Derived outputs read lines and notify on edit, add, remove, and patch", () => {
  const session = open(({ output }) => ({
    count: output(({ lines }) => lines.length),
    total: output(({ lines }) => amountOf(lines)),
  }));
  const seen = [];
  session.watchOutputs(({ count, total }) => seen.push([count, total]));
  const [first, second] = keys(session);
  session.row("lines", first).edit("quantity", 3);
  const [added] = session.add("lines", [{ price: 1 }], { at: 0 });
  session.remove("lines", [second]);
  session.patch({ lines: { [added]: { quantity: 4 } } });
  assert.deepEqual(seen, [
    [2, 20],
    [2, 40],
    [3, 41],
    [2, 31],
    [2, 34],
  ]);
});

test("A derived output that returns whole rows publishes a frozen copy of plain data", () => {
  const session = open(({ output }) => ({
    all: output(({ lines }) => lines),
    first: output(({ lines }) => lines[0]),
  }));
  const { all, first } = currentOutputs(session);
  const { lines } = session.getSnapshot().values;
  assert.deepEqual(all, lines);
  assert.deepEqual(first, lines[0]);
  assert.ok(Array.isArray(all));
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
  for (const value of [all, ...all, first]) assert.ok(Object.isFrozen(value));
  // A proxy could not be cloned.
  assert.deepEqual(structuredClone(all), lines);
  assert.throws(() => {
    all[0].quantity = 5;
  }, TypeError);
  // A later edit publishes another copy and leaves this one as it was.
  session.row("lines", keys(session)[0]).edit("quantity", 9);
  assert.equal(all[0].quantity, 1);
  assert.equal(first.quantity, 1);
  assert.equal(currentOutputs(session).all[0].quantity, 9);
});

test("Editing a field the derived output does not read leaves it unchanged without recalculating or notifying", () => {
  const runs = { count: 0, quantities: 0 };
  const session = open(({ output }) => ({
    count: output(({ lines }) => (runs.count++, lines.length)),
    quantities: output(({ lines }) => (runs.quantities++, lines.map((row) => row.quantity))),
  }));
  const seen = [];
  session.watchOutputs(({ count, quantities }) => seen.push([count, quantities]));
  const [first, second] = keys(session);
  const before = { ...runs };
  session.row("lines", first).edit("name", "z");
  session.patch({ note: "x", lines: { [second]: { price: 99 } } });
  assert.deepEqual(runs, before);
  session.row("lines", first).edit("quantity", 4);
  assert.deepEqual(runs, { count: before.count, quantities: before.quantities + 1 });
  assert.deepEqual(seen, [
    [2, [1, 2]],
    [2, [4, 2]],
  ]);
});

test("Moving rows recalculates an order-dependent derived output and recalculates another output that reads the rows without notifying", () => {
  const runs = { names: 0, total: 0, note: 0 };
  const session = open(({ output }) => ({
    names: output(({ lines }) => (runs.names++, lines.map((row) => row.name).join(","))),
    total: output(({ lines }) => (runs.total++, amountOf(lines))),
    note: output(({ note }) => (runs.note++, note)),
  }));
  const seen = { names: [], total: [] };
  session.watchOutputs(({ names }) => seen.names.push(names));
  session.watchOutputs(({ total }) => seen.total.push(total));
  const before = { ...runs };
  session.move("lines", keys(session)[0], 1);
  assert.deepEqual(runs, { names: before.names + 1, total: before.total + 1, note: before.note });
  // The same total is no change to notify.
  assert.deepEqual(seen, { names: ["a,b", "b,a"], total: [20] });
});
