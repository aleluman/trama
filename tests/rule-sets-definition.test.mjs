import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSession,
  declareContext,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
} from "trama-forms/core";
import { lotParams } from "./helpers/rows-async.mjs";
import {
  defineForm,
  defineRules,
  handlesOf,
  observer,
  rules,
  sale,
  saved,
  sets,
  setup,
} from "./helpers/rule-sets.mjs";

// A rule set as a value: what defineRules returns, what it keeps of the
// objects it receives, and how a form uses the definitions of its own fields.

test("A rule set is a frozen, opaque object whose copy is not a rule set", () => {
  const empty = coreRules({ rules: {} });
  assert.ok(Object.isFrozen(empty));
  assert.deepEqual(Reflect.ownKeys(empty), []);
  assert.equal(Object.getPrototypeOf(empty), Object.prototype);
  const fields = { note: coreField.text() };
  assert.doesNotThrow(() => coreForm({ fields, include: [empty] }));
  assert.throws(() => coreForm({ fields, include: [{ ...empty }] }), {
    message: "Form include[0]: expected a rule set, false, null or undefined",
  });
});

test("A rule set can declare just fields, just collections, or context without touching anything", () => {
  const context = declareContext();
  const onlyFields = coreRules({ fields: { note: coreField.text() }, rules: {} });
  const onlyRows = coreRules({ collections: { lines: { fields: {} } }, rules: {} });
  const withContext = coreRules({ context, rules: {} });
  const definition = coreForm({
    fields: { note: coreField.text({ default: "Hello" }) },
    collections: { lines: { fields: { quantity: coreField.number() } } },
    context,
    include: [onlyFields, onlyRows, withContext],
  });
  const session = createSession(definition, { context: { sent: false } });
  assert.deepEqual(session.getSnapshot().values, { note: "Hello", lines: [] });
});

test("A rule set serves two forms and multiple sessions, each with its own values", () => {
  const order = defineForm({ ...sale, include: [sets.lots, sets.amounts, sets.totals] });
  const quote = defineForm({
    ...sale,
    include: [sets.lots, sets.totals],
    rules: { lines: { each: { amount: { value: ({ quantity }) => (quantity ?? 0) * 7 } } } },
  });
  const first = setup(order).open([{ ...saved(1), price: 10, quantity: 2 }]);
  const second = setup(order).open([{ ...saved(1), price: 10, quantity: 3 }]);
  const third = setup(quote).open([{ ...saved(1), price: 10, quantity: 2 }]);
  assert.deepEqual(
    [first, second, third].map((session) => session.getSnapshot().values.total),
    [20, 30, 14],
  );
  handlesOf(first)[0].edit("quantity", 5);
  assert.deepEqual(
    [first, second, third].map((session) => session.getSnapshot().values.total),
    [50, 30, 14],
  );
});

test("Changing the author's objects and arrays afterward leaves the rule set unchanged", () => {
  const flags = [({ note }) => note === "" && "No note"];
  const entry = { disabled: flags, label: () => "Rate" };
  const section = { rate: entry };
  const fields = { note: coreField.text(), rate: coreField.number() };
  const collections = { lines: { fields: { quantity: coreField.number() } } };
  const set = coreRules({ fields, collections, rules: section });
  flags.push(() => "Another");
  entry.label = () => "Changed";
  entry.hidden = () => true;
  section.note = { hidden: () => true };
  fields.rate = coreField.text();
  collections.lines = { fields: {} };
  const session = createSession(
    coreForm({
      fields: { note: coreField.text(), rate: coreField.number() },
      collections: { lines: { fields: { quantity: coreField.number() } } },
      include: [set],
    }),
  );
  const { note, rate } = session.getSnapshot().fieldStates;
  assert.deepEqual(
    [rate.reasons, rate.label, rate.hidden, note.hidden],
    [["No note"], "Rate", false, false],
  );
});

test("Defining a rule set or a form that includes it runs no rules and makes no requests", () => {
  let runs = 0;
  const counted =
    (result = () => {}) =>
    (...args) => {
      runs++;
      return typeof result === "function" ? result(...args) : result;
    };
  const set = defineRules({
    ...sale,
    rules: {
      notes: { hidden: counted(false), onChange: counted() },
      lines: {
        each: {
          lot: { params: counted(lotParams) },
          price: { query: { endpoint: "linePrice", params: counted() } },
        },
      },
    },
  });
  const { calls } = setup(defineForm({ ...sale, include: [set] }));
  assert.deepEqual([runs, calls.length], [0, 0]);
});

test("The session uses the form's labels and defaults, including when a rule set calls toDefaults", () => {
  const set = coreRules({
    fields: {
      rate: coreField.number({ default: 5, label: "Rate from the rule set" }),
      reset: coreField.checkbox(),
    },
    rules: { reset: { onChange: (_, { toDefaults }) => toDefaults("rate") } },
  });
  const session = createSession(
    coreForm({
      fields: {
        rate: coreField.number({ default: 1, label: "Rate" }),
        reset: coreField.checkbox(),
      },
      include: [set],
    }),
    { initial: { rate: 9 } },
  );
  assert.equal(session.getSnapshot().fieldStates.rate.label, "Rate");
  session.edit("reset", true);
  assert.equal(session.getSnapshot().values.rate, 1);
});

const options = (...values) => values.map((value) => ({ value, label: value }));
test("A result outside the receiving field's actual options fails during the operation", () => {
  const set = coreRules({
    fields: {
      country: coreField.select({ options: options("ES", "MX", "JP") }),
      mode: coreField.text(),
    },
    rules: { country: { value: ({ mode }) => (mode === "" ? undefined : mode) } },
  });
  const session = createSession(
    coreForm({
      fields: {
        country: coreField.select({ options: options("ES", "MX") }),
        mode: coreField.text(),
      },
      include: [set],
    }),
  );
  session.edit("mode", "MX");
  assert.equal(session.getSnapshot().values.country, "MX");
  assert.throws(() => session.edit("mode", "JP"), {
    message: 'Field "country" value (include[0]): incompatible result "JP" for a select field',
  });
});

test("Each form compiles its own instance of the rule set, so two forms share neither rows nor queries", () => {
  const each = { ...rules.lots.lines.each, ...rules.pricing.lines.each };
  const twin = defineForm({ ...sale, rules: { lines: { each }, ...rules.totals } });
  const composed = defineForm({ ...sale, include: [sets.lots, sets.pricing, sets.totals] });
  const lines = [saved(1), saved(2, "south")];
  const inline = setup(twin);
  const included = setup(composed);
  const [a, b] = [inline.open(lines), included.open(lines)];
  const [seenA, seenB] = [observer(), observer()];
  assert.deepEqual(seenB(b), seenA(a));
  for (const session of [a, b]) handlesOf(session)[1].edit("quantity", 4);
  assert.deepEqual(seenB(b), seenA(a));
  assert.equal(included.calls.length, 2);
  assert.deepEqual(
    included.calls.map(({ key }) => key),
    inline.calls.map(({ key }) => key),
  );
});
