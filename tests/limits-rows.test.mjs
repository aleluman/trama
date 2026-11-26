import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects, states } from "./helpers/session.mjs";

// An order whose lines take the decimals of their price from the currency of
// the header; a free line has no maximum discount, and floor gives a line a
// minimum price.
const order = defineForm({
  fields: { currency: field.text({ default: "JPY" }) },
  collections: {
    lines: {
      fields: {
        price: field.number({ max: 1000 }),
        quantity: field.number({ min: 0 }),
        free: field.checkbox(),
        floor: field.number(),
        discount: field.number({ min: 0, max: 100 }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        price: {
          decimals: (_, { values }) => (values.currency === "USD" ? 2 : 0),
          min: ({ floor }) => floor ?? undefined,
        },
        discount: { max: ({ free }) => (free ? null : undefined) },
      },
    },
  },
});
const lines = (session) => states(session).lines;

test("the decimals of each row follow the header, and a checkbox on the row removes its maximum", () => {
  const session = createSession(order, { initial: { lines: [{}, { free: true }] } });
  const [first, second] = lines(session);
  assert.deepEqual([first.price.decimals, second.price.decimals], [0, 0]);
  assert.equal(first.discount.max, 100);
  assert.equal(Object.hasOwn(second.discount, "max"), false);
  session.edit("currency", "USD");
  assert.deepEqual(
    lines(session).map(({ price }) => price.decimals),
    [2, 2],
  );
  const [key] = keysOf(session);
  session.row("lines", key).edit("free", true);
  assert.equal(Object.hasOwn(lines(session)[0].discount, "max"), false);
  session.row("lines", key).edit("free", false);
  assert.equal(lines(session)[0].discount.max, 100);
});

test("a field with no contributions of its own shares its state across rows, and one row does not change its siblings", () => {
  const session = createSession(order, { initial: { lines: [{}, {}, {}] } });
  const before = lines(session);
  assert.equal(before[0].quantity, before[1].quantity);
  assert.deepEqual(before[0].quantity, { ...before[0].quantity, min: 0 });
  const [, middle] = keysOf(session);
  session.row("lines", middle).edit("free", true);
  const after = lines(session);
  assert.equal(after[0], before[0]);
  assert.equal(after[2], before[2]);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[1].price, before[1].price, "Only the discount state changes");
});

test("a row with min greater than max rejects the operation, and the message names the row", () => {
  const session = createSession(order, { initial: { lines: [{}, {}] } });
  const [, second] = keysOf(session);
  rejects(
    session,
    () => session.row("lines", second).edit("floor", 2000),
    `Field "price" of "lines" row "${second}" (number): min 2000 exceeds max 1000`,
  );
  const snapshot = session.getSnapshot();
  assert.throws(() => session.add("lines", [{ floor: 1001 }]), {
    message: /^Field "price" of "lines" row "r\d+" \(number\): min 1001 exceeds max 1000$/u,
  });
  assert.equal(session.getSnapshot(), snapshot);
  session.row("lines", second).edit("floor", 1000);
  assert.equal(lines(session)[1].price.min, 1000);
});

test("moving rows preserves their states and limits", () => {
  const session = createSession(order, { initial: { lines: [{ free: true }, {}] } });
  const [first, second] = lines(session);
  const [key] = keysOf(session);
  session.move("lines", key, 1);
  assert.deepEqual(lines(session), [second, first]);
});
