import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, declareContext, defineForm, field } from "trama-forms/core";
import { remote } from "./helpers/remote.mjs";

// Each field has a default of its own; defaults gives the values of the context.
const sizes = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
];
const form = defineForm({
  context: declareContext(),
  defaults: (current) => ({ ...current.values }),
  fields: {
    amount: field.number({ default: 5 }),
    title: field.text({ default: "Fixed" }),
    done: field.checkbox({ default: true }),
    size: field.select({ options: sizes, default: "a" }),
    plain: field.text({ default: "Field only" }),
    empty: field.number(),
    clear: field.checkbox(),
  },
  rules: {
    clear: {
      onChange: ({ clear }, { toDefaults }) =>
        clear ? toDefaults("amount", "title", "done", "size", "plain", "empty") : undefined,
    },
  },
});
const falsy = { amount: 0, title: "", done: false, size: null };
const truthy = { amount: 7, title: "Context", done: true, size: "b" };
// What neither defaults nor initial gives: the default of the field or the empty of its type.
const rest = { plain: "Field only", empty: null, clear: false };
const open = (values, initial) => createSession(form, { context: { values }, initial });
const valuesOf = (session) => session.getSnapshot().values;

test("initial state precedence is initial > defaults > default, including 0, false, empty string, and null", () => {
  assert.deepEqual(valuesOf(open(falsy)), { ...falsy, ...rest });
  assert.deepEqual(valuesOf(open(truthy)), { ...truthy, ...rest });
  assert.deepEqual(valuesOf(open(truthy, falsy)), { ...falsy, ...rest });
  assert.deepEqual(valuesOf(open(falsy, truthy)), { ...truthy, ...rest });
  assert.deepEqual(valuesOf(open({ amount: 0 }, { title: "" })), {
    amount: 0,
    title: "",
    done: true,
    size: "a",
    ...rest,
  });
  assert.deepEqual(valuesOf(open({}, { plain: "", empty: 0 })), {
    amount: 5,
    title: "Fixed",
    done: true,
    size: "a",
    plain: "",
    empty: 0,
    clear: false,
  });
});

test("toDefaults gives the value from defaults or falls back to the field default; reset restores the baseline with defaults and initial", () => {
  for (const values of [truthy, falsy]) {
    const session = open(values, { amount: 3, plain: "Saved" });
    const baseline = valuesOf(session);
    assert.deepEqual(baseline, { ...values, ...rest, amount: 3, plain: "Saved" });
    for (const [name, value] of Object.entries({
      amount: 9,
      title: "Edited",
      done: !values.done,
      size: "a",
      plain: "Edited",
      empty: 4,
    }))
      session.edit(name, value);
    session.edit("clear", true);
    assert.deepEqual(valuesOf(session), { ...values, ...rest, clear: true });
    session.reset();
    assert.deepEqual(valuesOf(session), baseline);
  }
});

// Records the arguments of each evaluation of defaults and the context that the
// label of date and the event of tick receive.
const recorded = () => {
  const calls = [];
  const seen = [];
  const definition = defineForm({
    context: declareContext(),
    defaults(...args) {
      calls.push(args);
      return { date: args[0].today };
    },
    fields: { date: field.text(), tick: field.checkbox() },
    rules: {
      date: {
        label: (_, tools) => {
          seen.push(tools.context);
          return tools.context.today;
        },
      },
      tick: {
        onChange: (_, tools) => {
          seen.push(tools.context);
          return tools.toDefaults("date");
        },
      },
    },
  });
  return { definition, calls, seen };
};

test("defaults runs once for each session, with the same frozen context its tools receive", () => {
  const { definition, calls, seen } = recorded();
  assert.equal(calls.length, 0, "defineForm does not evaluate defaults");
  const first = createSession(definition, { context: { today: "2026-09-27" } });
  const second = createSession(definition, { context: { today: "2026-12-24" } });
  assert.deepEqual(
    calls.map((args) => args.length),
    [1, 1],
  );
  const [[firstContext], [secondContext]] = calls;
  assert.ok(Object.isFrozen(firstContext) && Object.isFrozen(secondContext));
  for (const session of [first, second]) {
    session.edit("date", "Written");
    session.edit("tick", true);
    session.reset();
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(
    seen.map((current) => [firstContext, secondContext].indexOf(current)),
    [0, 1, 0, 0, 1, 1],
  );
  assert.deepEqual(
    [first, second].map((session) => valuesOf(session).date),
    ["2026-09-27", "2026-12-24"],
  );
  first.edit("date", "Written");
  first.edit("tick", false);
  first.edit("tick", true);
  assert.deepEqual([valuesOf(first).date, calls.length], ["2026-09-27", 2]);
});

test("at opening, a value formula replaces a value from defaults just as it replaces a field default, and initial takes precedence", () => {
  const definition = defineForm({
    context: declareContext(),
    defaults: () => ({ quantity: 3, total: 99 }),
    fields: { quantity: field.number({ default: 2 }), total: field.number() },
    rules: { total: { value: ({ quantity }) => (quantity ?? 0) * 10 } },
  });
  const session = createSession(definition, { context: {} });
  assert.deepEqual(valuesOf(session), { quantity: 3, total: 30 });
  session.edit("total", 99);
  session.reset();
  assert.deepEqual(valuesOf(session), { quantity: 3, total: 30 });
  const supplied = createSession(definition, { context: {}, initial: { total: 99 } });
  assert.deepEqual(valuesOf(supplied), { quantity: 3, total: 99 });
});

// An option with nested metadata, as the author writes it.
const option = () => ({ value: 1, label: "Acme", address: { city: "Madrid" }, tags: ["vip"] });

test("an async field receives a complete option from defaults, adopted as in initial: a frozen, detached copy", () => {
  const authored = option();
  let runs = 0;
  const definition = remote.defineForm({
    context: declareContext(),
    defaults: () => {
      runs++;
      return { customer: authored };
    },
    fields: { customer: remote.field.async("customers"), clear: remote.field.checkbox() },
    rules: {
      clear: {
        onChange: ({ clear }, { toDefaults }) => (clear ? toDefaults("customer") : undefined),
      },
    },
  });
  const session = createSession(definition, { scope: "acme", context: {} });
  const held = valuesOf(session).customer;
  assert.notEqual(held, authored);
  assert.deepEqual(held, option());
  for (const key of ["address", "tags"]) assert.notEqual(held[key], authored[key]);
  for (const value of [held, held.address, held.tags]) assert.ok(Object.isFrozen(value));
  assert.equal(Object.isFrozen(authored.address), false);
  authored.address.city = "Another";
  assert.equal(held.address.city, "Madrid");
  // toDefaults and reset give the adopted option, without evaluating defaults again.
  session.edit("customer", { value: 2, label: "Atlas" });
  session.edit("clear", true);
  assert.deepEqual(valuesOf(session).customer, option());
  session.reset();
  assert.equal(valuesOf(session).customer, held);
  assert.equal(runs, 1);
});

test("a field named __proto__ takes its value from defaults, and toDefaults and reset restore it", () => {
  const definition = defineForm({
    context: declareContext(),
    defaults: (current) => ({ ["__proto__"]: current.value }),
    fields: { ["__proto__"]: field.text({ default: "Fixed" }), clear: field.checkbox() },
    rules: {
      clear: {
        onChange: ({ clear }, { toDefaults }) => (clear ? toDefaults("__proto__") : undefined),
      },
    },
  });
  const session = createSession(definition, { context: { value: "Context" } });
  const own = () => Object.getOwnPropertyDescriptor(valuesOf(session), "__proto__")?.value;
  assert.equal(own(), "Context");
  session.edit("__proto__", "Edited");
  session.edit("clear", true);
  assert.equal(own(), "Context");
  session.edit("__proto__", "Once again");
  session.reset();
  assert.equal(own(), "Context");
});
