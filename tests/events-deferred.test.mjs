import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

// a.onChange writes x until gate is set, and then does what each test asks. With
// a before b, b.onChange sets gate after a.onChange ran, so x stays a destination
// of a.onChange from the discarded attempt; with b first, x never becomes one.
const probe = {
  a: field.number({ default: 1 }),
  b: field.number(),
  gate: field.checkbox(),
  x: field.number({ default: 10 }),
  y: field.number(),
};
const orders = [
  ["a", "b", "gate", "x", "y"],
  ["b", "gate", "a", "x", "y"],
];
// The fields of the probe in the given order, with x named target.
const fieldsOf = (order = orders[0], target = "x") =>
  Object.fromEntries(order.map((name) => [name === "x" ? target : name, probe[name]]));
const gated = (then, target = "x") => ({
  onChange: (values) => (values.gate ? then(values) : { [target]: 20 }),
});
const opens = { value: ({ a }) => a, onChange: () => ({ gate: true }) };
// The probe, with more fields or rules declared after a and b.
const form = (then, { fields = fieldsOf(), rules = {}, target } = {}) =>
  defineForm({ fields, rules: { a: gated(then, target), b: opens, ...rules } });
const valuesOf = (session) => session.getSnapshot().values;

test("An event reads a destination it wrote only in a discarded attempt without a cycle, in both field orders", () => {
  const seen = orders.map((order) => {
    const gates = [];
    const onChange = (values) => {
      gates.push(values.gate);
      return values.gate ? { y: values.x } : { x: 20 };
    };
    const session = createSession(
      defineForm({ fields: fieldsOf(order), rules: { a: { onChange }, b: opens } }),
    );
    session.edit("a", 2);
    assert.deepEqual(valuesOf(session), { a: 2, b: 2, gate: true, x: 10, y: 10 });
    return gates;
  });
  // Only the first order discards an invocation that wrote x.
  assert.deepEqual(seen, [[false, true], [true]]);
});

test("Skipping an event while resolving a destination leaves the other writers of that field in place", () => {
  const a = gated((values) => ({ y: values.x }));
  const x = { value: ({ a: value }) => (value ?? 0) * 100 };
  for (const rules of [
    { a, b: opens, x },
    { x, a, b: opens },
  ])
    for (const order of orders) {
      const session = createSession(defineForm({ fields: fieldsOf(order), rules }));
      session.edit("a", 2);
      const label = `${Object.keys(rules).join(" ")}; ${order.join(" ")}`;
      assert.deepEqual(valuesOf(session), { a: 2, b: 2, gate: true, x: 200, y: 200 }, label);
    }
});

test("The read works through a formula, with a patch that omits the field, with no patch, and for a __proto__ field", () => {
  const z = { value: ({ x }) => x };
  for (const [then, rules, expected] of [
    [(values) => ({ y: values.z }), { z }, { y: 10, z: 10 }],
    [
      (values) => {
        void values.x;
        return {};
      },
      {},
      { y: null, z: null },
    ],
    [(values) => ({ x: undefined, y: values.x }), {}, { y: 10, z: null }],
    [
      (values) => {
        void values.x;
      },
      {},
      { y: null, z: null },
    ],
  ])
    for (const order of orders) {
      const fields = { ...fieldsOf(order), z: field.number() };
      const session = createSession(form(then, { fields, rules }));
      session.edit("a", 2);
      assert.deepEqual(valuesOf(session), { a: 2, b: 2, gate: true, x: 10, ...expected });
    }

  // A field named __proto__ takes the place of x.
  const proto = "__proto__";
  for (const order of orders) {
    const then = (values) => ({ y: values[proto] });
    const session = createSession(form(then, { fields: fieldsOf(order, proto), target: proto }));
    session.edit("a", 2);
    assert.deepEqual(valuesOf(session), { a: 2, b: 2, gate: true, [proto]: 10, y: 10 });
  }
});

test("A reused event that read a destination from a discarded attempt keeps its patch", () => {
  let calls = 0;
  const a = gated((values) => ({ y: values.x }));
  const session = createSession(
    defineForm({
      // c.onChange writes w, which the second attempt settled after a.onChange
      // read x; the third attempt reads x again and reuses the patch.
      fields: { ...fieldsOf(), w: field.number(), c: field.checkbox() },
      rules: {
        a: {
          onChange: (values) => {
            calls++;
            return a.onChange(values);
          },
        },
        b: opens,
        c: { value: ({ gate }) => gate, onChange: () => ({ w: 1 }) },
      },
    }),
  );
  session.edit("a", 2);
  assert.deepEqual(valuesOf(session), { a: 2, b: 2, gate: true, x: 10, y: 10, w: 1, c: true });
  // One invocation before gate is set and one after it.
  assert.equal(calls, 2);
});

test("Two events with destinations from a discarded attempt each respond to what they read", () => {
  // a.onChange reads x, which c.onChange writes while it reads w, its own
  // destination from the discarded attempt.
  const session = createSession(
    defineForm({
      fields: {
        a: probe.a,
        c: field.number(),
        b: probe.b,
        gate: probe.gate,
        w: field.number({ default: 5 }),
        x: probe.x,
        y: probe.y,
        z: field.number(),
      },
      rules: {
        a: gated((values) => ({ y: values.x })),
        c: {
          value: ({ a }) => a,
          onChange: (values) => (values.gate ? { x: 30, z: values.w } : { w: 7 }),
        },
        b: opens,
      },
    }),
  );
  session.edit("a", 2);
  const expected = { a: 2, c: 2, b: 2, gate: true, w: 5, x: 30, y: 30, z: 5 };
  assert.deepEqual(valuesOf(session), expected);
});

test("What an event read without its write does not carry over to the next attempt or to another operation", () => {
  // Once c.onChange writes t, which the second attempt settled after a.onChange
  // read x, the third attempt writes x without reading it.
  const definition = form((values) => (values.t ? { x: 30 } : { y: values.x }), {
    fields: { ...fieldsOf(), c: field.checkbox(), t: field.checkbox() },
    rules: { c: { value: ({ gate }) => gate, onChange: () => ({ t: true }) } },
  });
  const attempts = createSession(definition);
  attempts.edit("a", 2);
  const done = { a: 2, b: 2, gate: true, c: true, t: true };
  assert.deepEqual(valuesOf(attempts), { ...done, x: 30, y: null });

  // With c set from the start, c.onChange does not run and the edit ends reading x.
  const operations = createSession(definition, { initial: { c: true } });
  operations.edit("a", 2);
  assert.deepEqual(valuesOf(operations), { ...done, t: false, x: 10, y: 10 });
  operations.edit("t", true);
  operations.edit("a", 3);
  assert.deepEqual(valuesOf(operations), { ...done, a: 3, b: 3, x: 30, y: 10 });
});

test("An event that reads a destination from a discarded attempt and writes it again creates a cycle", () => {
  const proto = "__proto__";
  for (const [definition, path] of [
    [form((values) => ({ x: values.x + 1 })), "a.onChange → x → a.onChange"],
    // Without gate, the second attempt reads x again and reuses the patch.
    [
      defineForm({
        fields: { a: probe.a, x: probe.x },
        rules: { a: { onChange: (values) => ({ x: values.x + 1 }) } },
      }),
      "a.onChange → x → a.onChange",
    ],
    [
      form((values) => ({ x: values.z + 1 }), {
        fields: { ...fieldsOf(), z: field.number() },
        rules: { z: { value: ({ x }) => x } },
      }),
      "a.onChange → z → x → a.onChange",
    ],
    // The patch also writes t, which a.onChange read first: the cycle is still x.
    [
      form(
        (values) => {
          void values.t;
          return { x: values.x + 1, t: true };
        },
        { fields: { ...fieldsOf(), t: field.checkbox() } },
      ),
      "a.onChange → x → a.onChange",
    ],
    [
      form((values) => ({ [proto]: values[proto] + 1 }), {
        fields: fieldsOf(undefined, proto),
        target: proto,
      }),
      `a.onChange → ${proto} → a.onChange`,
    ],
  ]) {
    const session = createSession(definition);
    rejects(session, () => session.edit("a", 2), `Field "a" onChange: cyclic dependency ${path}`);
  }
});

test("With multiple destinations from a discarded attempt, the cycle names the first one the event read among those it writes", () => {
  // a.onChange wrote x and w, and now reads x before w.
  const fields = { ...fieldsOf(), w: field.number({ default: 5 }) };
  for (const [then, path] of [
    [(values) => ({ w: values.x + values.w }), "w"],
    [(values) => ({ x: values.x + values.w }), "x"],
    [(values) => ({ x: values.x + 1, w: values.w + 1 }), "x"],
  ]) {
    const a = { onChange: (values) => (values.gate ? then(values) : { x: 20, w: 7 }) };
    const session = createSession(defineForm({ fields, rules: { a, b: opens } }));
    const message = `Field "a" onChange: cyclic dependency a.onChange → ${path} → a.onChange`;
    rejects(session, () => session.edit("a", 2), message);
  }
});

test("When two real cycles compete, the cycle from the final attempt is reported", () => {
  // Skipped by a.onChange, x settles; b.onChange writes it and the candidate
  // starts again, which discards the cycle of a.onChange.
  const a = { onChange: (values) => ({ x: values.x + 1 }) };
  const b = { value: ({ a: value }) => value, onChange: (values) => ({ x: values.x + 2 }) };
  for (const rules of [
    { a, b },
    { b, a },
  ]) {
    const session = createSession(
      defineForm({ fields: { a: probe.a, b: probe.b, x: probe.x }, rules }),
    );
    const message = 'Field "b" onChange: cyclic dependency x → b.onChange → x';
    rejects(session, () => session.edit("a", 2), message);
  }
});

test("A failure after reading a destination from a discarded attempt rejects the operation with that failure instead of a cycle", () => {
  const boom = new Error("No destination");
  const session = createSession(
    form((values) => {
      void values.x;
      throw boom;
    }),
  );
  rejects(
    session,
    () => session.edit("a", 2),
    'Field "a" onChange: event failed: No destination',
    boom,
  );

  const f = {
    value: ({ gate }) => {
      if (gate) throw boom;
      return 0;
    },
  };
  const other = createSession(
    form((values) => ({ y: values.x + values.f }), {
      fields: { ...fieldsOf(), f: field.number() },
      rules: { f },
    }),
  );
  rejects(other, () => other.edit("a", 2), 'Field "f" value: formula failed: No destination', boom);
});
