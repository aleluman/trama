import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

// A formula depends on what it reads with values; peek reads other without a dependency.
const reads = [false, true];
const label = (peek) => (peek ? "that reads other through peek" : "that reads through values");

for (const peek of reads)
  test(`a value formula ${label(peek)} runs on opening and when its reads change, and reset does not run it`, () => {
    let calls = 0;
    const definition = defineForm({
      fields: {
        source: field.number({ default: 2 }),
        other: field.number({ default: 1 }),
        total: field.number({ default: 5 }),
      },
      rules: {
        total: {
          value: (values, tools) => {
            calls++;
            return values.source * 10 + (peek ? tools.peek.other : values.other);
          },
        },
      },
    });
    const session = createSession(definition);
    assert.equal(session.getSnapshot().values.total, 21);
    assert.ok(calls > 0);
    session.edit("other", 2);
    assert.equal(session.getSnapshot().values.total, peek ? 21 : 22);
    session.edit("source", 3);
    assert.equal(session.getSnapshot().values.total, 32);
    const evaluated = calls;
    session.edit("source", 3);
    assert.equal(calls, evaluated, "An edit with no difference does not evaluate rules");
    session.reset();
    assert.equal(calls, evaluated, "Reset does not run value formulas");
    assert.deepEqual(session.getSnapshot().values, { source: 2, other: 1, total: 21 });
  });

for (const peek of reads)
  test(`a disabled formula ${label(peek)} runs on opening and when its reads change, and reset recalculates it`, () => {
    let calls = 0;
    const definition = defineForm({
      fields: {
        source: field.number({ default: 2 }),
        other: field.number({ default: 1 }),
        note: field.text({ default: "Retained" }),
      },
      rules: {
        note: {
          disabled: (values, tools) => {
            calls++;
            return values.source > (peek ? tools.peek.other : values.other);
          },
        },
      },
    });
    const session = createSession(definition);
    const disabled = () => session.getSnapshot().fieldStates.note.disabled;
    assert.equal(disabled(), true);
    assert.ok(calls > 0);
    session.edit("other", 5);
    assert.equal(disabled(), peek);
    session.edit("source", 9);
    assert.equal(disabled(), true);
    const evaluated = calls;
    session.edit("source", 9);
    assert.equal(calls, evaluated, "An edit with no difference does not evaluate rules");
    session.edit("other", 20);
    assert.equal(disabled(), peek);
    session.reset();
    assert.equal(disabled(), true, "Reset recalculates disabled against the baseline");
    assert.equal(session.getSnapshot().values.note, "Retained");
  });

test("an edit with no difference notifies without evaluating formulas or events or changing the reset version", () => {
  let calls = 0;
  const definition = defineForm({
    fields: { divisor: field.number({ default: 2 }), result: field.number(), note: field.text() },
    rules: {
      result: {
        value: ({ divisor }) => {
          calls++;
          return 10 / divisor;
        },
      },
      note: {
        disabled: ({ divisor }) => {
          calls++;
          return divisor > 1;
        },
      },
      divisor: {
        onChange: () => {
          calls++;
          return { note: "Changed" };
        },
      },
    },
  });
  const session = createSession(definition);
  const before = session.getSnapshot();
  const observed = [];
  session.subscribe(() => observed.push(session.getSnapshot()));
  const opened = calls;
  session.edit("divisor", 2);
  assert.equal(calls, opened, "It does not evaluate formulas or events");
  assert.equal(observed.length, 1);
  assert.notEqual(observed[0], before);
  assert.deepEqual(observed[0], before);
  session.reset();
  const evaluated = calls;
  session.edit("divisor", 2);
  assert.equal(calls, evaluated);
  assert.equal(observed.length, 3);
  assert.equal(session.getSnapshot().resetVersion, 1);
});

test("reset recalculates each derived output, and an equal result retains its identity and does not notify", () => {
  let evaluations = 0;
  const definition = defineForm({
    fields: { amount: field.number({ default: 1 }), note: field.text() },
    outputs: ({ output }) => ({
      amount: output((values) => {
        evaluations++;
        return { amount: values.amount };
      }),
    }),
  });
  const session = createSession(definition);
  const seen = [];
  session.watchOutputs(({ amount }) => seen.push(amount));
  session.edit("note", "Unrelated");
  const evaluated = evaluations;
  session.reset();
  assert.ok(evaluations > evaluated, "Reset recalculates even when its reads do not change");
  assert.equal(seen.length, 1, "An equal result does not notify");
  session.watchOutputs(({ amount }) => assert.equal(amount, seen[0]))();
  session.edit("amount", 2);
  session.reset();
  assert.deepEqual(seen, [{ amount: 1 }, { amount: 2 }, { amount: 1 }]);
});
