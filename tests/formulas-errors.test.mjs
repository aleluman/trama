import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

test("a failure rejects the entire edit and rejects opening, even when the value is supplied", () => {
  const boom = new Error("Price unavailable");
  const definition = defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      price: field.number({ default: 10 }),
      subtotal: field.number(),
      total: field.number(),
    },
    rules: {
      subtotal: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
      total: {
        value: ({ subtotal, quantity }) => {
          if (quantity === 3) throw boom;
          return (subtotal ?? 0) + 1;
        },
      },
    },
  });
  const session = createSession(definition);
  rejects(
    session,
    () => session.edit("quantity", 3),
    'Field "total" value: formula failed: Price unavailable',
    boom,
  );
  for (const initial of [{ quantity: 3 }, { quantity: 3, total: 9500 }])
    assert.throws(() => createSession(definition, { initial }), { cause: boom });
  session.edit("quantity", 4);
  assert.deepEqual(session.getSnapshot().values, {
    quantity: 4,
    price: 10,
    subtotal: 40,
    total: 41,
  });
});

test("a non-finite result or a result outside the field's domain rejects the operation", () => {
  const definition = defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      price: field.number({ default: 5000 }),
      total: field.number(),
      ratio: field.number(),
      mode: field.text(),
      label: field.text(),
      country: field.select({ options: [{ value: "ES", label: "Spain" }] }),
      done: field.checkbox(),
    },
    rules: {
      total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
      ratio: { value: ({ quantity }) => (quantity === 0 ? 0 / 0 : undefined) },
      label: { value: ({ mode }) => (mode === "null" ? null : undefined) },
      country: { value: ({ mode }) => (mode === "select" ? "ZZ" : undefined) },
      done: { value: ({ mode }) => (mode === "async" ? Promise.resolve(true) : undefined) },
    },
  });
  const session = createSession(definition);
  rejects(
    session,
    () => session.edit("quantity", Number.MAX_VALUE),
    'Field "total" value: incompatible result Infinity for a number field',
  );
  rejects(
    session,
    () => session.edit("quantity", 0),
    'Field "ratio" value: incompatible result NaN for a number field',
  );
  for (const [mode, message] of [
    ["null", 'Field "label" value: incompatible result null for a text field'],
    ["select", 'Field "country" value: incompatible result "ZZ" for a select field'],
    ["async", 'Field "done" value: incompatible result [object Promise] for a checkbox field'],
  ])
    rejects(session, () => session.edit("mode", mode), message);
  assert.equal(session.getSnapshot().values.total, 10000);
});

test("a cycle between formulas rejects the operation and names its path", () => {
  assert.throws(
    () =>
      createSession(
        defineForm({
          fields: { a: field.number(), b: field.number(), c: field.number() },
          rules: {
            c: { value: ({ a }) => a },
            a: { value: ({ b }) => b },
            b: { value: ({ a }) => a },
          },
        }),
      ),
    { message: 'Field "a" value: cyclic dependency a → b → a' },
  );
  const branching = defineForm({
    fields: { linked: field.checkbox(), a: field.number({ default: 1 }), b: field.number() },
    rules: {
      a: { value: (values) => (values.linked ? values.b : 1) },
      b: { value: ({ a }) => a },
    },
  });
  const session = createSession(branching);
  rejects(
    session,
    () => session.edit("linked", true),
    'Field "a" value: cyclic dependency a → b → a',
  );
});

test("reading the same field creates a cycle even with peek, and peek participates in cycle detection", () => {
  for (const rules of [
    { total: { value: ({ total }) => total } },
    { total: { value: (_, { peek }) => peek.total ?? 0 } },
  ])
    assert.throws(() => createSession(defineForm({ fields: { total: field.number() }, rules })), {
      message: 'Field "total" value: cyclic dependency total → total',
    });
  assert.throws(
    () =>
      createSession(
        defineForm({
          fields: { x: field.number(), a: field.number(), b: field.number() },
          rules: {
            a: { value: ({ x }, { peek }) => (x ?? 0) + (peek.b ?? 0) },
            b: { value: ({ a }) => a },
          },
        }),
      ),
    { message: 'Field "a" value: cyclic dependency a → b → a' },
  );
});

test("the diagnostic names the failing formula and excludes formulas that read it or catch its failure", () => {
  const boom = new Error("Missing rate");
  for (const read of [
    ({ rate }) => (rate ?? 0) * 2,
    (values) => {
      try {
        return (values.rate ?? 0) * 2;
      } catch {
        return 0;
      }
    },
    (_, { peek }) => {
      try {
        return (peek.rate ?? 0) * 2;
      } catch {
        throw new Error("Another cause");
      }
    },
  ]) {
    // total resolves first, so at opening it is the formula that reads the failure.
    const definition = defineForm({
      fields: { zone: field.text(), total: field.number(), rate: field.number() },
      rules: {
        total: { value: read },
        rate: {
          value: ({ zone }) => {
            if (zone === "south") throw boom;
            return 10;
          },
        },
      },
    });
    const message = 'Field "rate" value: formula failed: Missing rate';
    assert.throws(() => createSession(definition, { initial: { zone: "south" } }), {
      message,
      cause: boom,
    });
    const session = createSession(definition);
    rejects(session, () => session.edit("zone", "south"), message, boom);
  }
});

test("a cycle still rejects the operation when caught by the formula that reads it", () => {
  const cyclic = defineForm({
    fields: { a: field.number(), b: field.number() },
    rules: {
      a: {
        value: (values) => {
          try {
            return values.b;
          } catch {
            return 0;
          }
        },
      },
      b: { value: ({ a }) => a },
    },
  });
  assert.throws(() => createSession(cyclic), {
    message: 'Field "a" value: cyclic dependency a → b → a',
  });
});

test("values and peek are read-only at runtime", () => {
  for (const mutate of [
    (values) => {
      values.source = 99;
    },
    (values) => {
      delete values.source;
    },
    (values) => {
      Object.defineProperty(values, "source", { value: 99 });
    },
    (_, { peek }) => {
      peek.source = 99;
    },
  ]) {
    const definition = defineForm({
      fields: { source: field.number({ default: 2 }), total: field.number() },
      rules: {
        total: {
          value: (values, tools) => {
            if (values.source === 3) mutate(values, tools);
            return (values.source ?? 0) * 10;
          },
        },
      },
    });
    const session = createSession(definition);
    const before = session.getSnapshot();
    assert.throws(
      () => session.edit("source", 3),
      (error) => {
        assert.equal(
          error.message,
          'Field "total" value: formula failed: Formula values are readonly',
        );
        assert.ok(error.cause instanceof TypeError);
        return true;
      },
    );
    assert.equal(session.getSnapshot(), before);
  }
});

test("at runtime, defineForm rejects invalid rule objects, unknown rule keys and properties, and non-function formulas", () => {
  const fields = { total: field.number() };
  for (const [rules, message] of [
    [null, "Form rules must be an object keyed by field"],
    [[], "Form rules must be an object keyed by field"],
    [5, "Form rules must be an object keyed by field"],
    [new Map(), "Form rules must be an object keyed by field"],
    [() => ({ total: { value: () => 1 } }), "Form rules must be an object keyed by field"],
    [() => null, "Form rules must be an object keyed by field"],
    [{ totl: { value: () => 1 } }, 'Rules: unknown field "totl"'],
    [{ toString: { value: () => 1 } }, 'Rules: unknown field "toString"'],
    [{ total: () => 1 }, 'Field "total" rules: expected an object of properties'],
    [{ total: null }, 'Field "total" rules: expected an object of properties'],
    [{ total: [] }, 'Field "total" rules: expected an object of properties'],
    [{ total: { valeu: () => 1 } }, 'Field "total" rules: unknown property "valeu"'],
    [
      { total: { value: () => 1, onFuture: () => ({}) } },
      'Field "total" rules: unknown property "onFuture"',
    ],
    [{ total: { clearWhen: "hidden" } }, 'Field "total" rules: unknown property "clearWhen"'],
    [{ total: { value: 1 } }, 'Field "total" value: formula must be a function'],
    [{ total: { value: null } }, 'Field "total" value: formula must be a function'],
    [{ total: { value: [() => 1] } }, 'Field "total" value: formula must be a function'],
  ])
    assert.throws(() => defineForm({ fields, rules }), { message });
  const absent = defineForm({ fields, rules: { total: { value: undefined } } });
  assert.equal(createSession(absent).getSnapshot().values.total, null);
});
