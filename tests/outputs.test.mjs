import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

test("chained outputs use accepted values before opening and after editing or resetting", () => {
  const definition = defineForm({
    outputs: ({ output }) => {
      const subtotal = output((values) => values.total ?? 0);
      const caption = output((_, { read }) => `${read(subtotal)} units`);
      return { caption, subtotal };
    },
    rules: { total: { value: ({ quantity }) => (quantity ?? 0) * 10 } },
    fields: { quantity: field.number({ default: 2 }), total: field.number() },
  });
  const session = createSession(definition);
  const supplied = createSession(definition, { initial: { total: 17 } });
  const seen = [];
  const stop = session.watchOutputs(({ caption, subtotal }) => seen.push([caption, subtotal]));
  supplied.watchOutputs(({ caption }) => assert.equal(caption, "17 units"))();
  assert.deepEqual(seen, [["20 units", 20]]);
  assert.deepEqual(session.getSnapshot().values, { quantity: 2, total: 20 });
  session.edit("quantity", 3);
  session.edit("total", 25);
  session.reset();
  assert.deepEqual(seen, [
    ["20 units", 20],
    ["30 units", 30],
    ["25 units", 25],
    ["20 units", 20],
  ]);
  stop();
  session.edit("quantity", 4);
  assert.equal(seen.length, 4);
});

test("asynchronous work uses captured values without expanding reads or catching later errors", async () => {
  const session = createSession(
    defineForm({
      fields: { early: field.number(), late: field.number() },
      outputs: ({ output }) => ({
        early: output((values) => values.early),
        late: output((values) => values.late),
      }),
    }),
  );
  const tasks = [];
  const seen = [];
  const handled = [];
  const failure = new Error("Async application failure");
  session.watchOutputs(
    (outputs) => {
      const captured = outputs.early;
      tasks.push(
        (async () => {
          await Promise.resolve();
          seen.push([captured, outputs.late]);
          throw failure;
        })().catch((error) => handled.push(error)),
      );
    },
    { onError: () => assert.fail("Trama does not handle asynchronous errors") },
  );
  await Promise.all(tasks);
  session.edit("late", 4);
  await Promise.resolve();
  assert.equal(tasks.length, 1);
  session.edit("early", 2);
  await Promise.all(tasks);
  assert.deepEqual(seen, [
    [null, null],
    [2, 4],
  ]);
  assert.deepEqual(handled, [failure, failure]);
});

const symbol = Symbol("value");
const key = Symbol("key");

test("tracking is per whole output, with branches between references and plain object keys", () => {
  const session = createSession(
    defineForm({
      fields: { choose: field.checkbox(), left: field.text(), right: field.text() },
      outputs: ({ output }) => {
        const left = output((values) => ({ fixed: 1, text: values.left }));
        const right = output((values) => ({ fixed: 1, text: values.right }));
        const selected = output((values, { read }) => read(values.choose ? right : left));
        return { selected };
      },
    }),
  );
  const seen = [];
  session.watchOutputs(({ selected }) => seen.push(selected.fixed));
  session.edit("right", "Unselected");
  assert.deepEqual(seen, [1]);
  session.edit("left", "Changed nested sibling");
  assert.deepEqual(seen, [1, 1]);
  session.edit("choose", true);
  session.edit("left", "No longer selected");
  assert.deepEqual(seen, [1, 1, 1]);
});

test("plain non-JSON results have deep equality, stable identity, and frozen data detached from the source", () => {
  const external = {
    nested: [{ count: 1 }],
    missing: undefined,
    bigint: 4n,
    nan: NaN,
    infinity: Infinity,
    symbol,
    [key]: "symbol key",
  };
  const session = createSession(
    defineForm({
      fields: { tick: field.number(), changed: field.checkbox() },
      outputs: ({ output }) => {
        const data = output((values) => {
          void values.tick;
          return { ...external, zero: values.changed ? -0 : 0 };
        });
        const chained = output((_, { read }) => read(data).nested);
        return { data, chained };
      },
    }),
  );
  const seen = [];
  const chained = [];
  session.watchOutputs(({ data }) => seen.push(data));
  session.watchOutputs((outputs) => chained.push(outputs.chained));
  const first = seen[0];
  assert.notEqual(first.nested, external.nested);
  assert.ok(Object.isFrozen(first.nested[0]));
  assert.throws(() => {
    first.nested[0].count = 99;
  }, TypeError);
  session.edit("tick", 1);
  assert.equal(seen.length, 1);
  session.watchOutputs(({ data }) => assert.equal(data, first))();
  external.nested[0].count = 2;
  assert.equal(first.nested[0].count, 1);
  session.edit("tick", 2);
  assert.equal(seen.length, 2);
  assert.equal(seen[1].nested[0].count, 2);
  assert.equal(seen[1][key], "symbol key");
  assert.equal(seen[1].symbol, symbol);
  assert.equal(seen[1].bigint, 4n);
  session.edit("changed", true);
  assert.equal(seen.length, 3);
  assert.ok(Object.is(seen[2].zero, -0));
  assert.equal(chained.length, 2);
});

test("watchOutputs tracks names read, conditions, spread, and rest, and allows unsubscribing", () => {
  const session = createSession(
    defineForm({
      fields: { choose: field.checkbox(), left: field.text(), right: field.text() },
      outputs: ({ output }) => ({
        choose: output((values) => values.choose),
        left: output((values) => values.left),
        right: output((values) => values.right),
      }),
    }),
  );
  const selected = [];
  const copied = [];
  const rest = [];
  const stop = session.watchOutputs((outputs) =>
    selected.push(outputs.choose ? outputs.right : outputs.left),
  );
  session.watchOutputs((outputs) => copied.push({ ...outputs }));
  session.watchOutputs(({ choose, ...remaining }) => rest.push([choose, remaining]));
  session.edit("right", "R");
  assert.deepEqual(selected, [""]);
  session.edit("left", "L");
  session.edit("choose", true);
  session.edit("left", "unobserved");
  session.edit("right", "new");
  assert.deepEqual(selected, ["", "L", "R", "new"]);
  assert.equal(copied.length, 6);
  assert.deepEqual(rest.at(-1), [true, { left: "unobserved", right: "new" }]);
  stop();
  session.edit("right", "stopped");
  assert.equal(selected.length, 4);
});
