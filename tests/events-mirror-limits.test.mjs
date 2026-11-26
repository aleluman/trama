import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

// Number fields in the order of the given letters, with a at 1 and the others
// at 10; g is a checkbox.
const fieldsIn = (order) =>
  Object.fromEntries(
    [...order].map((name) => [
      name,
      name === "g" ? field.checkbox() : field.number({ default: name === "a" ? 1 : 10 }),
    ]),
  );
const edited = (definition) => {
  const session = createSession(definition);
  session.edit("a", 2);
  return session.getSnapshot().values;
};
const opens = { value: ({ a }) => a, onChange: () => ({ g: true }) };
// A handler that returns the patch until g is set, and then only reads the fields.
const readsOnceSet =
  (patch, ...names) =>
  (values) => {
    if (!values.g) return patch;
    for (const name of names) void values[name];
    return {};
  };

test("If a cycle path crosses a writer event that has not yet started an attempt, the candidate starts with that event", () => {
  // Until g is set, a.onChange writes w and y and c.onChange writes w. Then
  // a.onChange reads x and y, and c.onChange reads y and writes x: y is a
  // destination of a.onChange from a discarded attempt, and y ⇢ x a real edge.
  const rules = {
    b: opens,
    z: { value: ({ y }) => y + 1 },
    a: { onChange: (values) => (values.g ? { w: values.x + values.y + 1 } : { w: 1, y: 1 }) },
    c: {
      value: ({ a }) => a,
      onChange: (values) => (values.g ? { x: values.y + 2, w: values.y + 2 } : { w: 2 }),
    },
    w: { value: ({ x }) => x + 1 },
  };
  for (const order of ["ywbcazgx", "cyxzwgab"]) {
    const values = edited(defineForm({ fields: fieldsIn(order), rules }));
    assert.deepEqual(values, { a: 2, b: 2, c: 2, g: true, x: 12, y: 10, z: 11, w: 13 }, order);
  }

  // Each event ei, on its own field ei = a, wrote xi in a discarded attempt and
  // then reads zi = xi, with zi before xi: each one needs its own priority.
  const n = 4;
  const fields = { g: field.checkbox() };
  const many = {};
  for (let i = 0; i < n; i++) {
    fields[`z${i}`] = field.number();
    fields[`x${i}`] = field.number({ default: 10 });
    many[`z${i}`] = { value: (values) => values[`x${i}`] };
  }
  fields.a = field.number({ default: 1 });
  for (let i = 0; i < n; i++) {
    fields[`e${i}`] = field.number();
    fields[`y${i}`] = field.number();
    many[`e${i}`] = {
      value: ({ a }) => a,
      onChange: (values) => (values.g ? { [`y${i}`]: values[`z${i}`] } : { [`x${i}`]: 20 }),
    };
  }
  fields.b = field.number();
  many.b = opens;
  const values = edited(defineForm({ fields, rules: many }));
  for (let i = 0; i < n; i++)
    assert.deepEqual([values[`x${i}`], values[`z${i}`], values[`y${i}`]], [10, 10, 10], `e${i}`);
});

test("With multiple prioritized events, the attempt starts with the last one to receive priority", () => {
  // Until g is set, a.onChange writes w and z and c.onChange writes x; then both
  // only read. In the first order a.onChange gets priority and then c.onChange,
  // which must open the attempt; the edit ends with the fixed point in every order.
  const rules = {
    w: { value: ({ z }) => z + 1 },
    b: opens,
    a: { onChange: readsOnceSet({ w: 1, z: 1 }, "y", "w") },
    z: { value: ({ x }) => x + 1 },
    c: { value: ({ a }) => a, onChange: readsOnceSet({ x: 2 }, "z", "w") },
  };
  for (const order of ["gywacbxz", "abcgxyzw"]) {
    const values = edited(defineForm({ fields: fieldsIn(order), rules }));
    assert.deepEqual(values, { a: 2, b: 2, c: 2, g: true, w: 12, x: 10, y: 10, z: 11 }, order);
  }
});

test("A real cycle during field completion gives no priority to an edge outside its path", () => {
  // a.onChange reads f, whose writer c.onChange reads x. As x completes without
  // a.onChange, its formula reads z = x + 1: a real cycle from the last appearance
  // of x. The edge f ⇢ c.onChange lies outside it, so no event gets priority.
  const calls = [];
  const failure = new Error("p");
  const rules = {
    p: {
      value: ({ a }) => {
        if (a === 2) throw failure;
        return 0;
      },
    },
    a: {
      onChange: (values) => {
        calls.push("a");
        return values.g ? { y: values.f } : { x: 20 };
      },
    },
    c: {
      value: ({ a }) => a,
      onChange: (values) => {
        calls.push("c");
        return values.g ? { w: values.x } : { f: 30 };
      },
    },
    b: opens,
    x: { value: (values) => (values.g ? values.z : 0) },
    z: { value: ({ x }) => x + 1 },
  };
  for (const [order, message] of [
    // p, declared first, fails first.
    ["pxacbgfzyw", 'Field "p" value: formula failed: p'],
    ["xpacbgfzyw", 'Field "x" value: cyclic dependency x → z → x'],
  ]) {
    calls.length = 0;
    const session = createSession(defineForm({ fields: fieldsIn(order), rules }));
    rejects(session, () => session.edit("a", 2), message);
    // Each event runs before g is set and once after it, with no attempt opened by c.onChange.
    assert.deepEqual(calls.toSorted(), ["a", "a", "c", "c"], order);
  }
});

test("Priority assigned to an event in one operation does not carry over to the next", () => {
  // The first edit gives priority to a.onChange, because z goes before x. In the
  // second, the formula of p, declared first, and a.onChange both fail.
  const failures = { p: new Error("p"), a: new Error("a") };
  const rules = {
    p: {
      value: ({ a }) => {
        if (a === 3) throw failures.p;
        return 0;
      },
    },
    z: { value: ({ x }) => x },
    a: {
      onChange: (values) => {
        if (!values.g) return { x: 20 };
        if (values.a === 3) throw failures.a;
        return { y: values.z };
      },
    },
    b: opens,
  };
  const session = createSession(defineForm({ fields: fieldsIn("pzxabgy"), rules }));
  session.edit("a", 2);
  const values = { p: 0, z: 10, x: 10, a: 2, b: 2, g: true, y: 10 };
  assert.deepEqual(session.getSnapshot().values, values);
  // Without the priority of the first edit, p settles before a.onChange runs.
  const message = 'Field "p" value: formula failed: p';
  rejects(session, () => session.edit("a", 3), message, failures.p);
});

test("An event that wrote n fields in a discarded attempt and then only reads them is invoked twice and reads n fields", () => {
  const n = 8;
  const targets = Array.from({ length: n }, (_, i) => `x${i}`);
  let calls = 0;
  let reads = 0;
  const onChange = (values) => {
    calls++;
    if (!values.g) return Object.fromEntries(targets.map((name) => [name, 20]));
    let sum = 0;
    for (const name of targets) {
      reads++;
      sum += values[name];
    }
    return { y: sum };
  };
  const fields = { g: field.checkbox(), ...fieldsIn(targets), ...fieldsIn("aby") };
  const values = edited(defineForm({ fields, rules: { a: { onChange }, b: opens } }));
  assert.equal(values.y, 10 * n);
  assert.deepEqual({ calls, reads }, { calls: 2, reads: n });
});

test("With destinations from discarded attempts, rejection for a cycle can still depend on field order", () => {
  // At the fixed point w keeps its value, so c.onChange no longer runs and z is
  // a destination it wrote only in a discarded attempt.
  const single = {
    d: { value: ({ a }) => a, onChange: () => ({ x: 4 }) },
    z: { value: ({ x }) => x + 1 },
    c: { value: ({ w }) => w, onChange: () => ({ z: 3 }) },
    a: { onChange: (values) => ({ w: values.x + values.z + 1 }) },
  };
  const fixed = { a: 2, d: 2, x: 4, z: 5, w: 10, c: 10 };
  assert.deepEqual(edited(defineForm({ fields: fieldsIn("dawczx"), rules: single })), fixed);
  const rejected = createSession(defineForm({ fields: fieldsIn("waczxd"), rules: single }));
  const path = "a.onChange → z → c.onChange → c → w → a.onChange";
  rejects(rejected, () => rejected.edit("a", 2), `Field "a" onChange: cyclic dependency ${path}`);

  // Until g is set, a.onChange writes z and x and c.onChange writes x; then both
  // only read: three destinations of discarded attempts.
  const several = {
    c: { value: ({ a }) => a, onChange: readsOnceSet({ x: 2 }, "w", "x") },
    z: { value: ({ x }) => x + 1 },
    b: opens,
    w: { value: ({ x }) => x + 1 },
    a: { onChange: readsOnceSet({ z: 1, x: 1 }, "w") },
  };
  const values = edited(defineForm({ fields: fieldsIn("bcagyxwz"), rules: several }));
  assert.deepEqual(values, { a: 2, b: 2, c: 2, g: true, x: 10, y: 10, z: 11, w: 11 });
  const other = createSession(defineForm({ fields: fieldsIn("xzwcyabg"), rules: several }));
  const message = 'Field "a" onChange: cyclic dependency w → x → a.onChange → w';
  rejects(other, () => other.edit("a", 2), message);
});

test("In an order, a price change that switches to credit approves the discount without a cycle", () => {
  // price.onChange recalculates discount unless approval is set; then it
  // records the discount it approves. Credit sets approval.
  const session = createSession(
    defineForm({
      fields: {
        customer: field.number({ default: 7 }),
        discount: field.number({ default: 5 }),
        contact: field.text({ default: "Ana" }),
        price: field.number({ default: 100 }),
        qty: field.number({ default: 1 }),
        total: field.number(),
        paymentTerms: field.select({
          options: [
            { label: "Cash", value: "cash" },
            { label: "Credit", value: "credit" },
          ],
          default: "cash",
        }),
        approval: field.checkbox(),
        approvedDiscount: field.number({ default: 0 }),
      },
      rules: {
        price: {
          onChange: (values) =>
            values.approval
              ? { approvedDiscount: values.discount }
              : { discount: values.price >= 110 ? 10 : 0 },
        },
        total: { value: ({ price, qty }) => price * qty },
        paymentTerms: {
          value: ({ total }) => (total >= 110 ? "credit" : "cash"),
          onChange: (values) => (values.paymentTerms === "credit" ? { approval: true } : undefined),
        },
      },
    }),
  );
  session.edit("price", 120);
  assert.deepEqual(session.getSnapshot().values, {
    customer: 7,
    discount: 5,
    contact: "Ana",
    price: 120,
    qty: 1,
    total: 120,
    paymentTerms: "credit",
    approval: true,
    approvedDiscount: 5,
  });
});
