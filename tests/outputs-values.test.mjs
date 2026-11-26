import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs, outputFailure } from "./helpers/session.mjs";

// Counts evaluations of each output based on how it reads values.
const readers = (calls) =>
  defineForm({
    fields: {
      a: field.number({ default: 1 }),
      b: field.number({ default: 1 }),
      flag: field.checkbox(),
      other: field.text(),
    },
    outputs: ({ output }) => ({
      fromA: output(({ a }) => {
        calls.fromA++;
        return (a ?? 0) * 2;
      }),
      // Destructuring reads each name, including the name in the unused branch.
      branch: output(({ flag, a, b }) => {
        calls.branch++;
        return flag ? b : a;
      }),
      member: output((values) => {
        calls.member++;
        return values.flag ? values.b : values.a;
      }),
      rest: output(({ a, ...rest }) => {
        calls.rest++;
        return [a, Object.keys(rest).length];
      }),
    }),
  });

test("destructuring values tracks each field read, and other changes reuse the result", () => {
  const calls = { fromA: 0, branch: 0, member: 0, rest: 0 };
  const session = createSession(readers(calls));
  const seen = { fromA: [], branch: [] };
  session.watchOutputs(({ fromA }) => seen.fromA.push(fromA));
  session.watchOutputs(({ branch }) => seen.branch.push(branch));
  const before = { ...calls };
  session.edit("other", "Unrelated");
  assert.deepEqual(calls, { ...before, rest: before.rest + 1 }, "Only rest read other");

  session.edit("b", 2);
  assert.equal(calls.fromA, before.fromA, "fromA did not read b");
  assert.equal(calls.branch, before.branch + 1, "branch read b when destructuring");
  assert.equal(calls.member, before.member, "member did not read b with flag false");
  assert.deepEqual(seen, { fromA: [2], branch: [1] }, "An equal result does not notify");

  session.edit("flag", true);
  assert.deepEqual(seen, { fromA: [2], branch: [1, 2] }, "Each observer tracks what it reads");
  const member = calls.member;
  session.edit("b", 3);
  assert.equal(calls.member, member + 1, "member reads b when flag is true");
  session.edit("a", 5);
  assert.equal(calls.member, member + 1, "member stopped reading a");
  assert.deepEqual(seen, { fromA: [2, 10], branch: [1, 2, 3] });
  assert.deepEqual(currentOutputs(session).rest, [5, 3]);
});

test("(_, { read }) has no field dependencies: it recalculates only when the output it reads changes", () => {
  let chained = 0;
  const session = createSession(
    defineForm({
      fields: { a: field.number({ default: 2 }), other: field.text() },
      outputs: ({ output }) => {
        const half = output(({ a }) => ({ half: Math.floor((a ?? 0) / 2) }));
        const label = output((_, { read }) => {
          chained++;
          return `${read(half).half} pairs`;
        });
        return { half, label };
      },
    }),
  );
  const halves = [];
  session.watchOutputs(({ half }) => halves.push(half));
  const evaluated = chained;
  session.edit("other", "Unrelated");
  session.edit("a", 3);
  assert.equal(chained, evaluated, "An equal result keeps its reference and is reused");
  assert.equal(halves.length, 1);
  session.edit("a", 4);
  assert.equal(chained, evaluated + 1);
  assert.deepEqual(halves, [{ half: 1 }, { half: 2 }]);
  assert.equal(currentOutputs(session).label, "2 pairs");
});

test("names that are not fields and reads after return create no dependencies", () => {
  let captured;
  let calls = 0;
  const session = createSession(
    defineForm({
      fields: { a: field.number({ default: 1 }) },
      outputs: ({ output }) => ({
        loose: output((values) => {
          calls++;
          captured = values;
          return values.absent ?? "no field";
        }),
      }),
    }),
  );
  assert.equal(currentOutputs(session).loose, "no field");
  assert.equal(captured.a, 1);
  const evaluated = calls;
  session.edit("a", 2);
  assert.equal(calls, evaluated);
});

test("values is read-only and { read } is frozen", () => {
  const session = createSession(
    defineForm({
      fields: { count: field.number({ default: 1 }) },
      outputs: ({ output }) => ({
        assign: output((values) => {
          values.count = 999;
        }),
        remove: output((values) => {
          delete values.count;
        }),
        define: output((values) => Object.defineProperty(values, "count", { value: 999 })),
        tools: output((_, tools) => [Object.isFrozen(tools), Object.keys(tools)]),
        count: output(({ count }) => count),
      }),
    }),
  );
  for (const name of ["assign", "remove", "define"]) {
    const error = outputFailure(session, name);
    assert.ok(error.cause instanceof TypeError, name);
    assert.equal(
      error.message,
      `Output "${name}": calculation failed: Formula values are readonly`,
    );
  }
  assert.deepEqual(currentOutputs(session).tools, [true, ["read"]]);
  assert.equal(currentOutputs(session).count, 1);
});

test("a reference from another definition with the same fields is rejected when read or returned", () => {
  const fields = { a: field.number({ default: 1 }) };
  let mine;
  defineForm({
    fields,
    outputs: ({ output }) => {
      mine = output(({ a }) => a);
      return { mine };
    },
  });
  const session = createSession(
    defineForm({
      fields,
      outputs: ({ output }) => ({
        foreign: output((_, { read }) => read(mine)),
        safe: output(({ a }) => a),
      }),
    }),
  );
  const error = outputFailure(session, "foreign");
  assert.match(error.message, /^Output "foreign": calculation failed/u);
  assert.equal(error.cause.message, "Invalid or foreign output reference");
  assert.equal(currentOutputs(session).safe, 1);
  assert.throws(
    () => defineForm({ fields, outputs: () => ({ mine }) }),
    /^Error: Output "mine": invalid or foreign reference$/u,
  );
});

test("output callbacks that destructure values or read from the first argument fail in isolation", () => {
  const session = createSession(
    defineForm({
      fields: { a: field.number({ default: 1 }) },
      outputs: ({ output }) => {
        const ok = output((values) => values.a);
        return {
          ok,
          misplacedValues: output(({ values }) => values.a),
          misplacedRead: output(({ read }) => read(ok)),
        };
      },
    }),
  );
  for (const name of ["misplacedValues", "misplacedRead"]) {
    const error = outputFailure(session, name);
    assert.match(error.message, new RegExp(`^Output "${name}": calculation failed`, "u"));
    assert.ok(error.cause instanceof TypeError, name);
  }
  session.edit("a", 2);
  assert.equal(currentOutputs(session).ok, 2);
  assert.ok(outputFailure(session, "misplacedValues").cause instanceof TypeError);
});

test("catching a failure from an output accessed with read does not publish a result", () => {
  const session = createSession(
    defineForm({
      fields: { quantity: field.number({ default: 0 }) },
      outputs: ({ output }) => {
        const unit = output(({ quantity }) => {
          if (!quantity) throw new Error("Missing quantity");
          return 10 / quantity;
        });
        const guarded = output((_, { read }) => {
          try {
            return read(unit);
          } catch {
            return 0;
          }
        });
        return { guarded };
      },
    }),
  );
  const error = outputFailure(session, "guarded");
  assert.match(error.message, /^Output "guarded": calculation failed: Output "#1"/u);
  assert.equal(error.cause.cause.message, "Missing quantity");
  session.edit("quantity", 2);
  assert.equal(currentOutputs(session).guarded, 5);
});
