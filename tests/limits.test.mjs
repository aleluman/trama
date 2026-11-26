import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";
import { mapStates, states } from "./helpers/session.mjs";

// The limits a state publishes: only those some contribution gives.
const limitsOf = (state) =>
  Object.fromEntries(
    ["decimals", "min", "max"]
      .filter((key) => Object.hasOwn(state, key))
      .map((key) => [key, state[key]]),
  );

test("the definition declares decimals and limits, and state publishes only those it has", () => {
  const session = createSession(
    defineForm({
      fields: {
        price: field.number({ decimals: 2, min: 0 }),
        quantity: field.number({ min: undefined }),
        from: field.date({ min: "2026-01-01", max: "2026-12-31" }),
        note: field.text(),
      },
    }),
  );
  assert.deepEqual(mapStates(session, limitsOf), {
    price: { decimals: 2, min: 0 },
    quantity: {},
    from: { min: "2026-01-01", max: "2026-12-31" },
    note: {},
  });
  assert.ok(Object.isFrozen(states(session).price));
});

test("decimals and limits leave values unchanged, with no rounding or clipping", () => {
  const definition = defineForm({
    fields: {
      price: field.number({ decimals: 2, min: 0, max: 100 }),
      to: field.date({ max: "2026-04-01" }),
    },
  });
  const session = createSession(definition, { initial: { price: 123.456, to: "2026-05-01" } });
  assert.deepEqual(session.getSnapshot().values, { price: 123.456, to: "2026-05-01" });
  session.edit("price", -5.125);
  assert.equal(session.getSnapshot().values.price, -5.125);
  assert.deepEqual(limitsOf(states(session).price), { decimals: 2, min: 0, max: 100 });
});

// Four places decide the decimals of price, in declaration order: its
// definition, the patch of before, the formula of price and the patch of after.
const layered = () =>
  defineForm({
    fields: {
      before: field.number(),
      price: field.number({ decimals: 2 }),
      own: field.number(),
      after: field.number(),
    },
    rules: {
      before: {
        states: ({ before }) => (before === null ? undefined : { price: { decimals: before } }),
      },
      price: { decimals: ({ own }) => (own === null ? undefined : own) },
      after: {
        states: ({ after }) => (after === null ? undefined : { price: { decimals: after } }),
      },
    },
  });

test("the last declared contribution wins, and undefined falls back to the previous one and ultimately to the definition", () => {
  const session = createSession(layered());
  const decimals = () => states(session).price.decimals;
  assert.equal(decimals(), 2);
  session.edit("after", 4);
  session.edit("own", 3);
  session.edit("before", 1);
  assert.equal(
    decimals(),
    4,
    "Declaration order determines the result independently of evaluation order",
  );
  session.edit("after", null);
  assert.equal(decimals(), 3);
  session.edit("own", null);
  assert.equal(decimals(), 1);
  session.edit("before", null);
  assert.equal(decimals(), 2);
  session.edit("own", 0);
  assert.equal(decimals(), 0, "Zero decimals is a contribution");
});

const discounts = () =>
  defineForm({
    fields: {
      free: field.checkbox(),
      cap: field.number(),
      discount: field.number({ min: 0, max: 100 }),
    },
    rules: {
      free: { states: ({ free }) => (free ? { discount: { max: null } } : undefined) },
      discount: { max: ({ cap }) => (cap === null ? undefined : cap) },
    },
  });

test("null suppresses the limit from previous contributions, and a later one restores it", () => {
  const session = createSession(discounts());
  const discount = () => limitsOf(states(session).discount);
  assert.deepEqual(discount(), { min: 0, max: 100 });
  session.edit("free", true);
  assert.deepEqual(discount(), { min: 0 }, "With no maximum, the key is not published");
  assert.equal(Object.hasOwn(states(session).discount, "max"), false);
  session.edit("cap", 50);
  assert.deepEqual(
    discount(),
    { min: 0, max: 50 },
    "The later contribution overrides the suppression",
  );
  session.edit("cap", null);
  assert.deepEqual(discount(), { min: 0 });
  session.edit("free", false);
  assert.deepEqual(
    discount(),
    { min: 0, max: 100 },
    "Withdrawing the suppression restores the definition",
  );
});

test("unchanged state keeps its identity, even when suppressing a limit that was already absent", () => {
  const session = createSession(
    defineForm({
      fields: { mode: field.text(), price: field.number({ decimals: 2 }), note: field.text() },
      rules: {
        price: {
          min: ({ mode }) => (mode === "none" ? null : undefined),
          decimals: ({ mode }) => (mode === "two" ? 2 : undefined),
        },
      },
    }),
  );
  const first = states(session);
  session.edit("mode", "none");
  assert.equal(
    states(session).price,
    first.price,
    "Suppressing an already absent minimum leaves state unchanged",
  );
  session.edit("mode", "two");
  assert.equal(
    states(session).price,
    first.price,
    "Providing the same number of decimals also leaves state unchanged",
  );
  session.edit("note", "another");
  assert.equal(states(session).price, first.price);
});

test("a date's minimum follows another date, null suppresses it, and reset recalculates it", () => {
  const definition = defineForm({
    fields: { from: field.date(), to: field.date({ max: "2026-12-31" }) },
    rules: { to: { min: ({ from }) => from } },
  });
  const session = createSession(definition, { initial: { from: "2026-03-01" } });
  const to = () => limitsOf(states(session).to);
  assert.deepEqual(to(), { min: "2026-03-01", max: "2026-12-31" });
  session.edit("from", null);
  assert.deepEqual(to(), { max: "2026-12-31" });
  session.edit("from", "2026-05-01");
  assert.deepEqual(to(), { min: "2026-05-01", max: "2026-12-31" });
  session.reset();
  assert.deepEqual(to(), { min: "2026-03-01", max: "2026-12-31" });
});

test("a rule set contributes decimals at its position in include, and the inline rule follows", () => {
  const fields = { currency: field.text(), price: field.number({ decimals: 0 }) };
  const money = defineRules({
    fields,
    rules: { price: { decimals: ({ currency }) => (currency === "USD" ? 2 : undefined) } },
  });
  const capped = defineRules({ fields, rules: { price: { max: () => 1000 } } });
  const session = createSession(
    defineForm({
      fields,
      include: [money, capped],
      rules: {
        price: { decimals: ({ currency }) => (currency === "XTS" ? 4 : undefined) },
      },
    }),
  );
  const price = () => limitsOf(states(session).price);
  assert.deepEqual(price(), { decimals: 0, max: 1000 });
  session.edit("currency", "USD");
  assert.deepEqual(price(), { decimals: 2, max: 1000 });
  session.edit("currency", "XTS");
  assert.deepEqual(price(), { decimals: 4, max: 1000 });
});

test("an intermediate min greater than max is allowed if the combined limits are valid", () => {
  const session = createSession(
    defineForm({
      fields: { low: field.number(), price: field.number({ min: 0, max: 10 }) },
      rules: {
        price: {
          min: ({ low }) => low ?? undefined,
          states: ({ low }) => (low === null ? undefined : { price: { max: low + 5 } }),
        },
      },
    }),
  );
  session.edit("low", 20);
  assert.deepEqual(limitsOf(states(session).price), { min: 20, max: 25 });
});
