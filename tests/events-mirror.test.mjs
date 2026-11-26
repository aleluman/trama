import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

// The probe of events-deferred in its mirror order: x before a, and a before b.
// a.onChange writes x until b.onChange sets gate, so the discarded attempt
// leaves x as a destination of a.onChange; then x, as it settles, invokes the
// event that reads it again.
const probe = {
  a: field.number({ default: 1 }),
  b: field.number(),
  c: field.number(),
  gate: field.checkbox(),
  x: field.number({ default: 10 }),
  y: field.number(),
  z: field.number(),
  w: field.number(),
};
const mirror = ["x", "a", "b", "gate", "y"];
const fieldsOf = (order = mirror) => Object.fromEntries(order.map((name) => [name, probe[name]]));
const gated = (then) => ({
  onChange: (values) => (values.gate ? then(values) : { x: 20 }),
});
const opens = { value: ({ a }) => a, onChange: () => ({ gate: true }) };
// The probe, with more rules declared after a and b.
const form = (then, { order = mirror, rules = {} } = {}) =>
  defineForm({ fields: fieldsOf(order), rules: { a: gated(then), b: opens, ...rules } });
const edited = (definition) => {
  const session = createSession(definition);
  session.edit("a", 2);
  return session.getSnapshot().values;
};
const done = { a: 2, b: 2, gate: true, x: 10 };
const z = { value: ({ x }) => x };
const w = { value: ({ z: value }) => value };
const cyclic = (path, rule = 'Field "a" onChange') => `${rule}: cyclic dependency ${path}`;
// A handler that reads x and returns the given patch.
const reads = (patch) => (values) => {
  void values.x;
  return patch;
};

test("A field that invokes its event and is read again completes without it, directly, through formulas, and in a chain", () => {
  let calls = 0;
  const onChange = (values) => {
    calls++;
    if (!values.gate) return { x: 20 };
    void values.x;
    return { y: values.x };
  };
  const probed = defineForm({ fields: fieldsOf(), rules: { a: { onChange }, b: opens } });
  assert.deepEqual(edited(probed), { ...done, y: 10 });
  // One invocation before gate is set and one after it, although it reads x twice.
  assert.equal(calls, 2);

  for (const order of [
    // x settles first, so the edge x ⇢ a.onChange is at the bottom of the path.
    ["x", "z", "a", "b", "gate", "y"],
    // z settles first, and the edge is in the middle.
    ["z", "x", "a", "b", "gate", "y"],
    ["x", "z", "w", "a", "b", "gate", "y"],
    ["w", "z", "x", "a", "b", "gate", "y"],
    ["z", "w", "x", "a", "b", "gate", "y"],
  ]) {
    const read = order.includes("w") ? "w" : "z";
    const rules = read === "w" ? { z, w } : { z };
    const result = edited(form((values) => ({ y: values[read] }), { order, rules }));
    const expected = { ...done, y: 10, z: 10, ...(read === "w" && { w: 10 }) };
    assert.deepEqual(result, expected, order.join(" "));
  }
});

test("A field that completes without its event applies each of its other writers once, before and after the event", () => {
  const a = gated((values) => ({ y: values.x }));
  const x = { value: ({ a: value }) => value * 100 };
  for (const rules of [
    { a, b: opens, x },
    { x, a, b: opens },
  ]) {
    const result = edited(defineForm({ fields: fieldsOf(), rules }));
    assert.deepEqual(result, { ...done, x: 200, y: 200 }, Object.keys(rules).join(" "));
  }
});

test("In mirror order, the read works with a patch that omits the field, no patch, a patch with the field set to undefined, and a field named __proto__", () => {
  for (const [then, y] of [
    [reads({}), null],
    [reads(), null],
    [(values) => ({ x: undefined, y: values.x }), 10],
  ])
    assert.deepEqual(edited(form(then)), { ...done, y });

  const proto = "__proto__";
  const { a, b, gate, x, y } = probe;
  const fields = { [proto]: x, a, b, gate, y };
  const onChange = (values) => (values.gate ? { y: values[proto] } : { [proto]: 20 });
  const result = edited(defineForm({ fields, rules: { a: { onChange }, b: opens } }));
  assert.deepEqual(result, { [proto]: 10, a: 2, b: 2, gate: true, y: 10 });
});

test("Two events that wrote the field in a discarded attempt now only read it", () => {
  // c.onChange, with c = a, also wrote x before gate was set.
  const c = {
    value: ({ a }) => a,
    onChange: (values) => (values.gate ? { w: values.x } : { x: 30 }),
  };
  const order = ["x", "a", "c", "b", "gate", "y", "w"];
  const result = edited(form((values) => ({ y: values.x }), { order, rules: { c } }));
  assert.deepEqual(result, { ...done, c: 2, y: 10, w: 10 });
});

test("In mirror order, a patch that writes the field completed without it creates a cycle whether the event is invoked or reused", () => {
  const increments = { onChange: (values) => ({ x: values.x + 1 }) };
  const writesX = {
    value: ({ a }) => a,
    onChange: (values) => (values.gate ? { x: values.x + 1 } : { x: 30 }),
  };
  for (const [definition, message] of [
    [form((values) => ({ x: values.x + 1 })), cyclic("x → a.onChange → x")],
    // Without gate, the second attempt reads x again and reuses the patch.
    [
      defineForm({ fields: fieldsOf(["x", "a"]), rules: { a: increments } }),
      cyclic("x → a.onChange → x"),
    ],
    [
      form((values) => ({ x: values.z + 1 }), {
        order: ["x", "z", "a", "b", "gate", "y"],
        rules: { z },
      }),
      cyclic("x → a.onChange → z → x", 'Field "x" value'),
    ],
    // As x completes without a.onChange, c.onChange reads x and writes it.
    [
      form((values) => ({ y: values.x }), {
        order: ["x", "a", "c", "b", "gate", "y"],
        rules: { c: writesX },
      }),
      cyclic("x → c.onChange → x", 'Field "c" onChange'),
    ],
    // As x completes without a.onChange, its formula reads y, which a.onChange writes.
    [
      form((values) => ({ y: values.x + 1 }), {
        rules: { x: { value: ({ y }) => (y ?? 0) + 100 } },
      }),
      cyclic("a.onChange → x → y → a.onChange"),
    ],
  ]) {
    const session = createSession(definition);
    rejects(session, () => session.edit("a", 2), message);
  }
});

test("In both orders, a failure before the patch is known rejects the operation with that failure instead of a cycle", () => {
  const boom = new Error("boom");
  // a.onChange reads x and fails once gate is set; before, it wrote x.
  const throwing = {
    onChange: (values) => {
      const previous = values.x;
      if (values.gate) throw boom;
      return { x: previous + 1 };
    },
  };
  for (const order of [mirror, ["a", "b", "gate", "x", "y"]]) {
    const definition = defineForm({ fields: fieldsOf(order), rules: { a: throwing, b: opens } });
    const session = createSession(definition);
    rejects(session, () => session.edit("a", 2), 'Field "a" onChange: event failed: boom', boom);
  }

  // The formula of x fails as x completes without a.onChange, whether a.onChange
  // reads x or catches two reads of it and returns a patch: both reads fail.
  const x = {
    value: ({ gate }) => {
      if (gate) throw boom;
      return 0;
    },
  };
  const caught = [];
  for (const then of [
    (values) => ({ y: values.x }),
    (values) => {
      for (let read = 0; read < 2; read++)
        try {
          caught.push(values.x);
        } catch (error) {
          caught.push(error.cause);
        }
      return { y: 1 };
    },
  ]) {
    const session = createSession(form(then, { rules: { x } }));
    rejects(session, () => session.edit("a", 2), 'Field "x" value: formula failed: boom', boom);
  }
  assert.deepEqual(caught, [boom, boom]);
});

test("An event that reads the field being completed inside a try/catch sees no failure and returns no alternative result", () => {
  // c.onChange, with c = a, also wrote y before gate was set.
  const c = {
    value: ({ a }) => a,
    onChange: (values) => (values.gate ? { out2: values.y } : { y: 30 }),
  };
  const { gate, x, a, b } = probe;
  const y = field.number({ default: 5 });
  const fields = { gate, x, y, a, c: probe.c, b, out: field.number(), out2: field.number() };
  for (const capture of [false, true]) {
    const seen = [];
    const read = (values) => {
      if (!capture) return values.x;
      try {
        return values.x;
      } catch (error) {
        seen.push(error);
        return 0;
      }
    };
    const rules = { a: gated((values) => ({ out: read(values) + values.y })), c, b: opens };
    const result = edited(defineForm({ fields, rules }));
    const expected = { gate: true, x: 10, y: 5, a: 2, c: 2, b: 2, out: 15, out2: 5 };
    assert.deepEqual(result, expected);
    assert.deepEqual(seen, []);
  }
});

test("A formula that reads the field inside a try/catch and validation of a reused patch also complete the field", () => {
  const caught = {
    value: (values) => {
      try {
        return values.x;
      } catch {
        return -1;
      }
    },
  };
  for (const order of [
    ["x", "z", "a", "b", "gate", "y"],
    ["z", "x", "a", "b", "gate", "y"],
  ]) {
    const result = edited(form((values) => ({ y: values.z }), { order, rules: { z: caught } }));
    assert.deepEqual(result, { ...done, y: 10, z: 10 }, order.join(" "));
  }

  // c.onChange writes w, which the second attempt settled after a.onChange read
  // x; the third attempt reads x again to reuse the patch.
  let calls = 0;
  const then = (values) => {
    calls++;
    return { y: values.x };
  };
  const c = { value: ({ gate }) => (gate ? 1 : 0), onChange: () => ({ w: 1 }) };
  const result = edited(form(then, { order: [...mirror, "w", "c"], rules: { c } }));
  assert.deepEqual(result, { ...done, y: 10, w: 1, c: 1 });
  assert.equal(calls, 1);
});

test("What an attempt recorded or prioritized does not carry over to the next attempt or to another operation", () => {
  const c = { value: ({ gate }) => gate, onChange: () => ({ t: true }) };
  // With z first, the edge x ⇢ a.onChange is in the middle and a.onChange opens
  // the next attempts.
  for (const [order, read] of [
    [mirror, "x"],
    [["z", ...mirror], "z"],
  ]) {
    // Once c.onChange writes t, which the second attempt settled after a.onChange
    // read x, the next attempt writes x without reading it.
    const definition = defineForm({
      fields: { ...fieldsOf(order), c: field.checkbox(), t: field.checkbox() },
      rules: {
        a: gated((values) => (values.t ? { x: 30 } : { y: values[read] })),
        b: opens,
        c,
        ...(read === "z" && { z }),
      },
    });
    const through = (value) => (read === "z" ? { z: value } : {});
    const label = order.join(" ");
    const attempts = { ...done, c: true, t: true, x: 30, y: null, ...through(30) };
    assert.deepEqual(edited(definition), attempts, label);

    // With c set from the start, c.onChange does not run and the edit ends reading x.
    const session = createSession(definition, { initial: { c: true } });
    session.edit("a", 2);
    const first = { ...done, c: true, t: false, y: 10, ...through(10) };
    assert.deepEqual(session.getSnapshot().values, first, label);
    session.edit("t", true);
    session.edit("a", 3);
    const second = { ...first, a: 3, b: 3, t: true, x: 30, ...through(30) };
    assert.deepEqual(session.getSnapshot().values, second, label);
  }
});
