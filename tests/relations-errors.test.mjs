import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";
import { checkStep, exchange, exchangeFields, openExchange, pair } from "./helpers/relations.mjs";
import { heard, rejects } from "./helpers/session.mjs";

const invalidDriver = (message) => (error) => {
  assert.equal(error.message, message);
  assert.equal(error.cause?.message, 'the driver "driver" holds "R", which is no member');
  return true;
};
const formulaFailure = 'Field "rate" value (relation of "driver"): formula failed';

test("an unknown text driver fails on opening or patching without publishing", () => {
  assert.throws(() => openExchange(undefined, { driver: "R" }), invalidDriver(formulaFailure));
  const session = openExchange();
  const before = session.getSnapshot();
  const published = heard(session);
  assert.throws(() => session.patch({ driver: "R" }), invalidDriver(formulaFailure));
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(published, []);
});

test("an unknown driver in add neither publishes nor keeps the rejected row", () => {
  const form = defineForm({
    fields: {},
    collections: { lines: { fields: exchangeFields } },
    rules: { lines: { each: { driver: exchange } } },
  });
  const session = createSession(form);
  const before = session.getSnapshot();
  const published = heard(session);
  assert.throws(
    () => session.add("lines", [{ driver: "R" }]),
    (error) => {
      assert.match(
        error.message,
        /^Field "rate" of "lines" row "r\d+" value \(relation of "driver"\): formula failed$/u,
      );
      assert.equal(error.cause?.message, 'the driver "driver" holds "R", which is no member');
      return true;
    },
  );
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(published, []);
  const [key] = session.add("lines", [{ driver: "rate" }]);
  assert.deepEqual(session.getSnapshot().rows.lines, [key]);
  assert.deepEqual(pair(session.row("lines", key)), ["rate", 150, 15000]);
  assert.equal(published.length, 1);
});

test("a canonical patch with an unknown driver rejects the commit and allows the prepared submission to be reused", async () => {
  const session = openExchange();
  const sent = await session.prepare();
  const before = session.getSnapshot();
  const published = heard(session);
  assert.throws(() => session.commit(sent, { driver: "R" }), invalidDriver(formulaFailure));
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(published, []);
  checkStep(session)(
    () => assert.equal(session.commit(sent, { driver: "rate", foreign: 200 }), true),
    ["rate", 150, 30000],
  );
});

test("the final driver value takes effect even if the command wrote an unknown driver", () => {
  const session = openExchange({
    driver: { ...exchange, value: ({ tick }) => (tick === 1 ? "rate" : undefined) },
  });
  checkStep(session)(() => session.patch({ driver: "R", tick: 1 }), ["rate", 150, 15000]);
});

test("the select field accepts a member with an empty name and reserves null for the default", () => {
  const fields = {
    "": field.number({ default: 20 }),
    amount: field.number({ default: 5 }),
    driver: field.select({
      options: [
        { value: "", label: "Empty" },
        { value: "amount", label: "Amount" },
      ],
    }),
  };
  const relation = {
    default: "amount",
    members: { "": (values) => values.amount * 2, amount: (values) => values[""] / 2 },
  };
  const session = createSession(defineForm({ fields, rules: { driver: { relation } } }));
  const step = checkStep(session, (handle) => handle.getSnapshot().values);
  assert.deepEqual(session.getSnapshot().values, { "": 10, amount: 5, driver: null });
  rejects(
    session,
    () => session.patch({ driver: "typo" }),
    'Patch: incompatible value "typo" for select field "driver"',
  );
  step(() => session.edit("", 30), { "": 30, amount: 15, driver: "" });
  step(() => session.reset(), { "": 10, amount: 5, driver: null });
  step(() => session.edit("driver", ""), { "": 10, amount: 5, driver: "" });
  step(() => session.edit("driver", null), { "": 10, amount: 5, driver: null });

  const text = { ...fields, driver: field.text() };
  assert.throws(() => defineForm({ fields: text, rules: { driver: { relation } } }), {
    message: 'Field "driver" relation: a member cannot name the empty text ""',
  });
});

test("a cycle triggered by repeating a write to the derived member does not survive rejection", () => {
  const relation = {
    ...exchange.relation,
    members: {
      ...exchange.relation.members,
      local: (values, { peek }) => (peek.tick === 1 ? values.local : values.foreign * values.rate),
    },
  };
  const session = openExchange({ driver: { relation } }, { driver: "rate", rate: 150, local: 777 });
  const before = session.getSnapshot();
  const published = heard(session);
  assert.throws(() => session.patch({ local: 777, tick: 1 }), /cyclic dependency/u);
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(published, []);
  const step = checkStep(session);
  step(() => session.edit("tick", 1), ["rate", 150, 777]);
  // A command that repeats a read of the derived member visits its formula,
  // which only runs if this command wrote it.
  step(() => session.patch({ rate: 150, tick: 2 }), ["rate", 150, 777]);
});

const malformed = [
  [() => 0, "expected an object with default and members"],
  [{ ...exchange.relation, base: "foreign" }, 'unknown property "base"'],
  [{ default: "rate" }, "members: expected an object of formulas keyed by field"],
  [{ default: "rate", members: [] }, "members: expected an object of formulas keyed by field"],
  [{ default: "rate", members: { rate: () => 1 } }, "expected two members, got 1"],
  [
    { default: "rate", members: { ...exchange.relation.members, tick: () => 1 } },
    "expected two members, got 3",
  ],
  [{ ...exchange.relation, default: "tick" }, 'default: expected "rate" or "local"'],
  [{ members: exchange.relation.members }, 'default: expected "rate" or "local"'],
  [
    { default: "rate", members: { rate: () => 1, driver: () => "" } },
    "the driver cannot be one of its members",
  ],
  [
    { default: "rate", members: { rate: () => 1, unknown: () => 2 } },
    'member "unknown" is not a field',
  ],
  [
    { default: "rate", members: { rate: () => 1, local: 2 } },
    "members.local: formula must be a function",
  ],
];

test("defineForm and defineRules check the shape, pair, and default", () => {
  for (const [relation, problem] of malformed) {
    const config = { fields: exchangeFields, rules: { driver: { relation } } };
    const separator = problem.startsWith("members") || problem.startsWith("default") ? " " : ": ";
    const expected = { message: `Field "driver" relation${separator}${problem}` };
    assert.throws(() => defineForm(config), expected);
    assert.throws(() => defineRules(config), expected);
  }
});

test("definition checks the driver's type and its select options", () => {
  const rule = { driver: exchange };
  for (const [driver, problem] of [
    [field.number(), "number fields cannot drive a relation; use a text or a select"],
    [
      field.select({ options: [{ value: "rate", label: "Rate" }] }),
      'member "local" is not an option of the select',
    ],
    [
      field.select({
        options: [
          { value: "rate", label: "Rate" },
          { value: "local", label: "Local" },
          { value: "none", label: "Other" },
        ],
      }),
      'option "none" of the select is not a member',
    ],
  ]) {
    const config = { fields: { ...exchangeFields, driver }, rules: rule };
    const expected = { message: `Field "driver" relation: ${problem}` };
    assert.throws(() => defineForm(config), expected);
    assert.throws(() => defineRules(config), expected);
  }
});

test("a row member must exist in the same collection", () => {
  const fields = { rate: field.number(), local: field.number() };
  const collections = { lines: { fields: { driver: field.text(), rate: field.number() } } };
  assert.throws(
    () => defineRules({ fields, collections, rules: { lines: { each: { driver: exchange } } } }),
    { message: 'Field "driver" of "lines" relation: member "local" is not a field' },
  );
});
