import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

test("the outputs section requires a synchronous factory and a map of its own references", () => {
  for (const result of [null, [], Promise.resolve({}), new Map()]) {
    assert.throws(() => defineForm({ fields: {}, outputs: () => result }), /Outputs/u);
  }
  assert.throws(() => defineForm({ fields: {}, outputs: {} }), /outputs.*function/u);
  assert.throws(
    () => defineForm({ fields: {}, outputs: ({ output }) => ({ invalid: output(42) }) }),
    /formula.*function/u,
  );
});

test("a failure isolates the output and its dependents, preserves the edit, and recovers even with the same successful result", () => {
  const failure = new Error("Cannot calculate");
  let unavailable = false;
  const definition = failingOutputs(failure, () => unavailable);
  const session = createSession(definition);
  const values = [];
  const errors = [];
  const safe = [];
  session.watchOutputs(({ caption }) => values.push(caption), {
    onError: (error) => errors.push(error),
  });
  session.watchOutputs((outputs) => safe.push(outputs.safe));
  session.edit("fail", true);
  assert.equal(session.getSnapshot().values.fail, true);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /caption/u);
  assert.match(errors[0].cause.message, /amount/u);
  assert.equal(errors[0].cause.cause, failure);
  session.edit("unrelated", "Still usable");
  assert.equal(
    errors.length,
    1,
    "An output failure with unchanged dependencies is not published again",
  );
  assert.deepEqual(safe, ["", "Still usable"]);
  session.edit("fail", false);
  assert.deepEqual(values, ["20 units", "20 units"]);
  unavailable = true;
  session.reset();
  assert.equal(errors.length, 2);
  unavailable = false;
  session.reset();
  assert.deepEqual(values, ["20 units", "20 units", "20 units"]);
});

test("failing observers and handlers are isolated from the first callback and always return an unsubscribe function", (context) => {
  const reports = [];
  captureReports(context, reports);
  const session = countSession();
  const failure = new Error("Observer");
  const handlerFailure = new Error("Handler");
  let noReads = 0;
  const emptyStop = session.watchOutputs(() => {
    noReads++;
    throw failure;
  });
  const stop = session.watchOutputs(
    ({ count }) => {
      void count;
      throw failure;
    },
    {
      onError: () => {
        throw handlerFailure;
      },
    },
  );
  const seen = [];
  const reentrant = [];
  const editStop = session.watchOutputs(({ count }) => session.edit("count", count), {
    onError: (error) => {
      reentrant.push(error);
      session.reset();
    },
  });
  session.watchOutputs(({ count }) => seen.push(count));
  assert.equal(typeof stop, "function");
  assert.equal(reports[0], failure);
  assert.equal(reports[1], handlerFailure);
  assert.match(reports[2].message, /reset.*notification/u);
  assert.match(reentrant[0].message, /edit.*notification/u);
  assert.doesNotThrow(() => session.edit("count", 2));
  assert.deepEqual(seen, [null, 2]);
  assert.equal(reports.length, 5);
  assert.equal(noReads, 1);
  assert.equal(reentrant.length, 2);
  stop();
  editStop();
  emptyStop();
  session.edit("count", 3);
  assert.equal(reports.length, 5);
  assert.deepEqual(seen, [null, 2, 3]);
});

test("unsupported results, cycles, and foreign references fail without blocking valid outputs", () => {
  class RecordLike {
    amount = 1;
  }
  const cycle = {};
  cycle.self = cycle;
  const foreign = foreignOutput();
  assert.throws(() => defineForm({ fields: {}, outputs: () => ({ foreign }) }), /foreign/u);
  const invalid = [
    new Date(),
    new Map(),
    new Set(),
    new RecordLike(),
    () => 1,
    Promise.resolve(1),
    cycle,
    {
      get value() {
        return 1;
      },
    },
  ];
  for (const value of invalid) {
    const session = createSession(
      defineForm({
        fields: {},
        outputs: ({ output }) => ({
          bad: output(() => value),
          foreign: output((_, { read }) => read(foreign)),
          safe: output(() => "usable"),
        }),
      }),
    );
    const errors = [];
    session.watchOutputs(({ bad }) => void bad, { onError: (error) => errors.push(error) });
    session.watchOutputs((outputs) => outputs.foreign, { onError: (error) => errors.push(error) });
    assert.match(errors[0].message, /bad/u);
    assert.match(errors[1].message, /foreign/u);
    session.watchOutputs(({ safe }) => assert.equal(safe, "usable"))();
  }
});

test("a formula cannot mutate values accepted by an edit", () => {
  const session = createSession(
    defineForm({
      fields: { count: field.number() },
      outputs: ({ output }) => ({
        corrupt: output((values) => {
          void values.count;
          values.count = 999;
          return values.count;
        }),
        current: output((values) => values.count),
      }),
    }),
  );
  const errors = [];
  const current = [];
  session.watchOutputs(({ corrupt }) => void corrupt, { onError: (error) => errors.push(error) });
  session.watchOutputs((outputs) => current.push(outputs.current));
  session.edit("count", 2);
  assert.equal(session.getSnapshot().values.count, 2);
  assert.deepEqual(current, [null, 2]);
  assert.equal(errors[0].cause instanceof TypeError, true);
});

function failingOutputs(failure, unavailable = () => false) {
  return defineForm({
    fields: { fail: field.checkbox(), unrelated: field.text() },
    outputs: ({ output }) => {
      const amount = output((values) => {
        if (values.fail || unavailable()) throw failure;
        return { amount: 20 };
      });
      const caption = output((_, { read }) => `${read(amount).amount} units`);
      const safe = output((values) => values.unrelated);
      return { amount, caption, safe };
    },
  });
}

test("an output that fails at opening preserves readiness and its observer recovers", () => {
  const failure = new Error("Opening");
  const definition = failingOutputs(failure);
  const failedOpening = createSession(definition, { initial: { fail: true } });
  const initial = [];
  failedOpening.watchOutputs(({ amount }) => initial.push(amount), {
    onError: (error) => initial.push(error),
  });
  assert.equal(initial[0].cause, failure);
  failedOpening.edit("fail", false);
  assert.deepEqual(initial[1], { amount: 20 });
});

function captureReports(context, reports) {
  const originalReport = globalThis.reportError;
  globalThis.reportError = (error) => reports.push(error);
  context.after(() => {
    if (originalReport) globalThis.reportError = originalReport;
    else delete globalThis.reportError;
  });
}

function foreignOutput() {
  let foreign;
  defineForm({
    fields: {},
    outputs: ({ output }) => {
      foreign = output(() => 1);
      return { foreign };
    },
  });
  return foreign;
}

test("an output cycle stays isolated and allows conditional recovery", () => {
  const recursive = createSession(
    defineForm({
      fields: { cycle: field.checkbox({ default: true }) },
      outputs: ({ output }) => {
        const a = output((values, { read }) => (values.cycle ? read(b) : 1));
        const b = output((_, { read }) => read(a));
        return { a, b };
      },
    }),
  );
  const seen = [];
  recursive.watchOutputs(({ b }) => seen.push(b), { onError: (error) => seen.push(error) });
  assert.ok(seen[0] instanceof Error);
  recursive.edit("cycle", false);
  assert.equal(seen[1], 1);
});

function countSession() {
  return createSession(
    defineForm({
      fields: { count: field.number() },
      outputs: ({ output }) => ({ count: output((values) => values.count) }),
    }),
  );
}

test("a rejected rule preserves the values, outputs, and observations of the accepted publication", () => {
  const session = createSession(
    defineForm({
      fields: { amount: field.number(), total: field.number() },
      rules: {
        total: {
          value: ({ amount }) => {
            if (amount < 0) throw new Error("Invalid amount");
            return amount * 10;
          },
        },
      },
      outputs: ({ output }) => ({ total: output((values) => values.total) }),
    }),
  );
  const seen = [];
  session.watchOutputs(({ total }) => seen.push(total));
  session.edit("amount", 2);
  const before = session.getSnapshot();
  assert.throws(() => session.edit("amount", -1), /total.*value/u);
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(seen, [0, 20]);
  session.watchOutputs(({ total }) => assert.equal(total, 20))();
});
