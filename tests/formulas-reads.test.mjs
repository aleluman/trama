import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

test("peek reads the final field value without creating a dependency", () => {
  const definition = defineForm({
    // total is declared before price, so peek must resolve price first.
    fields: {
      quantity: field.number({ default: 2 }),
      total: field.number(),
      price: field.number(),
    },
    rules: {
      total: { value: ({ quantity }, { peek }) => (quantity ?? 0) * (peek.price ?? 0) },
      price: { value: ({ quantity }) => ((quantity ?? 0) >= 10 ? 90 : 100) },
    },
  });
  const session = createSession(definition);
  assert.equal(session.getSnapshot().values.total, 200);
  session.edit("price", 120);
  assert.equal(session.getSnapshot().values.total, 200);
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 300);
  session.edit("quantity", 10);
  assert.deepEqual(session.getSnapshot().values, { quantity: 10, total: 900, price: 90 });
});

test("peek also supports destructuring and preserves the edit until a read changes", () => {
  const definition = defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      price: field.number({ default: 10 }),
      total: field.number(),
    },
    rules: {
      total: { value: ({ quantity }, { peek: { price } }) => (quantity ?? 0) * (price ?? 0) },
    },
  });
  const session = createSession(definition);
  session.edit("total", 7);
  session.edit("price", 11);
  assert.equal(session.getSnapshot().values.total, 7);
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 33);
});

test("every name read is a dependency, even when destructuring an unused branch", () => {
  const fields = {
    alternate: field.checkbox(),
    a: field.number({ default: 2 }),
    b: field.number({ default: 10 }),
    total: field.number(),
  };
  const destructured = createSession(
    defineForm({
      fields,
      rules: { total: { value: ({ alternate, a, b }) => (alternate ? b : a) } },
    }),
  );
  const member = createSession(
    defineForm({
      fields,
      rules: { total: { value: (values) => (values.alternate ? values.b : values.a) } },
    }),
  );
  for (const session of [destructured, member]) {
    assert.equal(session.getSnapshot().values.total, 2);
    session.edit("total", 25);
    session.edit("b", 11);
  }
  assert.equal(destructured.getSnapshot().values.total, 2);
  assert.equal(member.getSnapshot().values.total, 25);
  member.edit("alternate", true);
  assert.equal(member.getSnapshot().values.total, 11);
});

test("a name that is not a field reads as it would on an object and creates no dependency", () => {
  let calls = 0;
  const definition = defineForm({
    fields: { quantity: field.number({ default: 2 }), summary: field.text() },
    rules: {
      summary: {
        value: (values) => {
          calls++;
          const names = Object.keys(values).join();
          return `${String(values.missing)} ${typeof values.toString} ${names} ${values.quantity}`;
        },
      },
    },
  });
  const session = createSession(definition);
  assert.equal(session.getSnapshot().values.summary, "undefined function quantity,summary 2");
  const evaluated = calls;
  session.edit("summary", "Manual");
  assert.equal(calls, evaluated);
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.summary, "undefined function quantity,summary 3");
});

test("a read after the formula returns creates no dependency", () => {
  let captured;
  const definition = defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      price: field.number(),
      total: field.number(),
    },
    rules: {
      total: {
        value: (values) => {
          captured = values;
          return (values.quantity ?? 0) * 10;
        },
      },
    },
  });
  const session = createSession(definition);
  assert.equal(captured.price, null);
  session.edit("total", 7);
  session.edit("price", 3);
  assert.equal(session.getSnapshot().values.total, 7);
});
