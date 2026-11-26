import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects, states } from "./helpers/session.mjs";

// A rejected combination leaves nothing behind: an edit that combines the
// states again afterwards shows the contributions of the last committed
// operation, not those of the rejected one. low raises the minimum of price,
// which takes it, and of cap, whose maximum rejects it; note recombines price.
const fields = {
  mode: field.text(),
  low: field.number(),
  high: field.number(),
  note: field.text(),
  price: field.number({ max: 1000 }),
  cap: field.number({ max: 10 }),
};
const rules = {
  price: {
    min: ({ mode, low, high }) => (mode === "high" ? high : low) ?? undefined,
    required: ({ note }) => note !== "",
  },
  cap: { min: ({ low }) => low ?? undefined },
};

test("in the header, a later edit does not reveal the rejected contribution or its reads", () => {
  const session = createSession(defineForm({ fields, rules }));
  const price = () => states(session).price;
  session.edit("low", 5);
  rejects(session, () => session.edit("low", 20), 'Field "cap" (number): min 20 exceeds max 10');
  session.edit("note", "recombine");
  assert.deepEqual([price().min, price().required], [5, true]);
  // The rejected operation also changed what price reads: high instead of low.
  session.patch({ high: 30 });
  rejects(
    session,
    () => session.patch({ mode: "high", low: 20 }),
    'Field "cap" (number): min 20 exceeds max 10',
  );
  session.edit("low", 7);
  assert.equal(price().min, 7);
  session.reset();
  assert.equal(price().min, undefined);
  session.edit("low", 3);
  rejects(session, () => session.edit("low", 11), 'Field "cap" (number): min 11 exceeds max 10');
  session.edit("note", "another");
  assert.equal(price().min, 3);
});

test("in rows, a later edit to the same row does not reveal the rejected contribution", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: { lines: { fields } },
      rules: { lines: { each: rules } },
    }),
    { initial: { lines: [{}, {}] } },
  );
  const [first, second] = keysOf(session).map((key) => session.row("lines", key));
  const price = (index) => states(session).lines[index].price;
  first.edit("low", 5);
  rejects(
    session,
    () => second.edit("low", 20),
    `Field "cap" of "lines" row "${second.key}" (number): min 20 exceeds max 10`,
  );
  second.edit("note", "recombine");
  assert.deepEqual([price(0).min, price(1).min, price(1).required], [5, undefined, true]);
  rejects(
    session,
    () => first.edit("low", 50),
    `Field "cap" of "lines" row "${first.key}" (number): min 50 exceeds max 10`,
  );
  first.edit("note", "recombine");
  assert.equal(price(0).min, 5);
  session.reset();
  assert.deepEqual([price(0).min, price(1).min], [undefined, undefined]);
});
