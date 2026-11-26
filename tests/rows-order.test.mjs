import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects } from "./helpers/session.mjs";

// The first failure follows the header, the collections as declared, their rows
// as created and their fields as declared, each followed by its event; never the
// visual position. Failing rules name a row by its id, diagnostics by its key.
const fail = (message) => {
  throw new Error(message);
};
const failed = (name, key, detail, rule = "value: formula failed") =>
  `Field "${name}" of "lines" row "${key}" ${rule}: ${detail}`;
const idsOf = (session) => session.getSnapshot().values.lines.map((line) => line.id);

// Every order of the items.
const permutations = (items) =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        permutations(items.toSpliced(index, 1)).map((rest) => [item].concat(rest)),
      );

// Moves the rows to the given visual order, one command at a time.
const arrange = (session, order) => {
  for (const [position, key] of order.entries()) session.move("lines", key, position);
};

// The amount of a line fails when its price or the rate is negative.
const amountOf = (line, { values }) =>
  (line.price ?? 0) < 0 || values.rate < 0
    ? fail(`Line ${line.id}`)
    : (line.price ?? 0) * values.rate;
const lineFields = { id: field.text(), price: field.number(), amount: field.number() };
const priced = defineForm({
  fields: { rate: field.number({ default: 1 }) },
  collections: { lines: { fields: lineFields } },
  rules: { lines: { each: { amount: { value: amountOf } } } },
});

// A and B on opening, and C added at the start: visually C, A, B.
const opened = () => {
  const session = createSession(priced, { initial: { lines: [{ id: "A" }, { id: "B" }] } });
  const [a, b] = keysOf(session);
  const [c] = session.add("lines", [{ id: "C" }], { at: 0 });
  return { session, a, b, c };
};
const negative = (...keys) => ({ lines: Object.fromEntries(keys.map((k) => [k, { price: -1 }])) });

test("The first row failure is from the earliest created row, regardless of visual position", () => {
  const { session, a, b, c } = opened();
  assert.deepEqual(idsOf(session), ["C", "A", "B"]);
  assert.deepEqual(keysOf(session), [c, a, b]);
  // Every row fails, and A was created first.
  rejects(session, () => session.edit("rate", -1), failed("amount", a, "Line A"));
  // C and B fail, written in visual order: B was created before C.
  rejects(session, () => session.patch(negative(c, b)), failed("amount", b, "Line B"));
  // A row added at the start is the last one created.
  const [d] = session.add("lines", [{ id: "D" }], { at: 0 });
  assert.deepEqual(idsOf(session), ["D", "C", "A", "B"]);
  rejects(session, () => session.patch(negative(d, c)), failed("amount", c, "Line C"));
});

test("Moving rows preserves the first failure in every visual order, and removing the earliest created row passes it to the next", () => {
  const { session, a, b, c } = opened();
  for (const order of permutations([a, b, c])) {
    arrange(session, order);
    assert.deepEqual(keysOf(session), order);
    rejects(session, () => session.edit("rate", -1), failed("amount", a, "Line A"));
    rejects(session, () => session.patch(negative(c, b)), failed("amount", b, "Line B"));
  }
  session.remove("lines", [a]);
  rejects(session, () => session.edit("rate", -1), failed("amount", b, "Line B"));
});

test("A header failure is reported before a row failure, and collections follow declaration order even if their rows were created later", () => {
  const each = { amount: { value: amountOf } };
  const definition = defineForm({
    fields: { rate: field.number({ default: 1 }), check: field.number() },
    collections: { taxes: { fields: lineFields }, lines: { fields: lineFields } },
    rules: {
      lines: { each },
      check: { value: ({ rate }) => (rate < 0 ? fail("Header") : rate) },
      rate: { onChange: ({ rate }) => (rate < -5 ? fail("Rate") : undefined) },
      taxes: { each },
    },
  });
  const session = createSession(definition, { initial: { lines: [{ id: "A" }] } });
  const [a] = keysOf(session);
  const [tax] = session.add("taxes", [{ id: "TAX" }]);
  // Every row fails as well.
  rejects(session, () => session.edit("rate", -1), 'Field "check" value: formula failed: Header');
  // The event of rate runs right after rate, before check.
  rejects(session, () => session.edit("rate", -10), 'Field "rate" onChange: event failed: Rate');
  const taxed = `Field "amount" of "taxes" row "${tax}" value: formula failed: Line TAX`;
  rejects(session, () => session.patch({ ...negative(a), taxes: negative(tax).lines }), taxed);
  rejects(session, () => session.patch(negative(a)), failed("amount", a, "Line A"));
});

// The step of each field of a line that fails on a negative price: price fails
// in its event, which follows it; amount and tax in their formulas.
const stepFailures = {
  price: (key) => failed("price", key, "Price A", "onChange: event failed"),
  amount: (key) => failed("amount", key, "Line A"),
  tax: (key) => failed("tax", key, "Tax A"),
};
const fieldsIn = (order) =>
  Object.fromEntries([["id", field.text()], ...order.map((name) => [name, field.number()])]);

test("Among fields in a row, the first declared field is reported even if each orders its rules differently", () => {
  const each = {
    tax: { value: (line) => ((line.price ?? 0) < 0 ? fail(`Tax ${line.id}`) : 0) },
    amount: { value: amountOf },
    price: { onChange: (line) => ((line.price ?? 0) < 0 ? fail(`Price ${line.id}`) : undefined) },
  };
  for (const order of permutations(Object.keys(stepFailures))) {
    const definition = defineForm({
      fields: { rate: field.number({ default: 1 }) },
      collections: { lines: { fields: fieldsIn(order) } },
      rules: { lines: { each } },
    });
    const session = createSession(definition, { initial: { lines: [{ id: "A" }] } });
    const [a] = keysOf(session);
    rejects(session, () => session.patch(negative(a)), stepFailures[order[0]](a));
  }
});

// Rules that record each run by name, and by row key for the rules of a row.
const recorder = () => {
  const runs = [];
  const counted = (name, rule) => (first, tools) => {
    runs.push(tools?.key === undefined ? name : `${name}:${tools.key}`);
    return rule(first, tools);
  };
  return { runs, counted };
};

test("For independent rows, move runs no row or header rules and publishes the same records once in a different order", () => {
  const { runs, counted } = recorder();
  const definition = defineForm({
    fields: { rate: field.number({ default: 1 }), label: field.text() },
    collections: { lines: { fields: { ...lineFields, lot: field.text() } } },
    rules: {
      label: { value: counted("label", ({ rate }) => `Rate ${rate}`) },
      lines: {
        each: {
          amount: {
            value: counted("amount", amountOf),
            readOnly: counted("readOnly", (line) => line.price === 0 && "Free"),
          },
          price: { onChange: counted("onChange", (_, { toDefaults }) => toDefaults("lot")) },
          lot: { states: counted("states", (line) => ({ lot: { hidden: line.id === "B" } })) },
        },
      },
    },
  });
  const session = createSession(definition, {
    initial: { lines: [{ id: "A", price: 0 }, { id: "B" }, { id: "C" }] },
  });
  const [a, b, c] = keysOf(session);
  const before = session.getSnapshot();
  let notifications = 0;
  session.subscribe(() => notifications++);
  runs.length = 0;
  session.move("lines", c, 0);
  assert.deepEqual([runs, notifications], [[], 1]);
  const { values, fieldStates, rows } = session.getSnapshot();
  assert.deepEqual(rows.lines, [c, a, b]);
  for (const [index, from] of [2, 0, 1].entries()) {
    assert.equal(values.lines[index], before.values.lines[from]);
    assert.equal(fieldStates.lines[index], before.fieldStates.lines[from]);
  }
  // The counters do record: an edit runs the rules of its own row.
  session.row("lines", a).edit("price", 2);
  assert.deepEqual(runs.toSorted(), [`amount:${a}`, `onChange:${a}`, `readOnly:${a}`]);
});

// Header and row rules that read the first row: structural readers.
const number = () => field.number();
const structural = (counted) =>
  defineForm({
    fields: { first: number(), double: number(), note: field.text() },
    collections: { lines: { fields: { price: number(), amount: number(), delta: number() } } },
    rules: {
      first: {
        value: counted("first", ({ lines }) => lines[0]?.price ?? null),
        onChange: counted("first.onChange", () => {}),
      },
      double: { value: counted("double", ({ first }) => (first ?? 0) * 2) },
      lines: {
        each: {
          amount: { value: counted("amount", ({ price }) => (price ?? 0) * 10) },
          delta: {
            value: counted("delta", (row, { values }) => row.price - values.lines[0].price),
          },
        },
      },
    },
  });
const shown = (session) => {
  const { first, double, lines } = session.getSnapshot().values;
  return [first, double, ...lines.map(({ amount, delta }) => `${amount}/${delta}`)];
};

test("With structural readers, move runs only those readers and the rules they trigger, including in the moved row", () => {
  const { runs, counted } = recorder();
  const session = createSession(structural(counted), {
    initial: { lines: [{ price: 1 }, { price: 2 }, { price: 3 }] },
  });
  const [a, b, c] = keysOf(session);
  const deltas = [`delta:${a}`, `delta:${b}`, `delta:${c}`];
  // The first row stays: first runs and keeps its value, so nothing follows it.
  runs.length = 0;
  session.move("lines", c, 1);
  assert.deepEqual(runs.toSorted(), ["first", ...deltas].toSorted());
  assert.deepEqual(shown(session), [1, 2, "10/0", "30/2", "20/1"]);
  // The first row changes: so does first, and its event and double follow.
  runs.length = 0;
  session.move("lines", b, 0);
  assert.deepEqual(runs.toSorted(), ["double", "first", "first.onChange", ...deltas].toSorted());
  assert.deepEqual(shown(session), [2, 4, "20/0", "10/-1", "30/1"]);
});

// Rows with fields and rules in the given orders and no two writers of a field:
// the depot of the header writes that of every line, whose event clears its lot.
const lineTypes = {
  quantity: field.number({ default: 1 }),
  price: field.number(),
  discount: field.number({ default: 0 }),
  amount: field.number(),
  net: field.number(),
  depot: field.text(),
  lot: field.text(),
};
const lineRules = {
  amount: { value: ({ quantity, price }, { values }) => quantity * (price ?? 0) * values.rate },
  net: { value: ({ amount, discount }) => amount - discount },
  depot: { onChange: (_, { toDefaults }) => toDefaults("lot") },
  discount: { disabled: ({ quantity }) => quantity <= 0 && "No quantity" },
};
const pick = (record, names) => Object.fromEntries(names.map((name) => [name, record[name]]));
const ordered = (fieldOrder, ruleOrder) =>
  defineForm({
    fields: { rate: field.number({ default: 1 }), depot: field.text(), total: field.number() },
    collections: { lines: { fields: pick(lineTypes, fieldOrder) } },
    rules: {
      depot: {
        onChange: ({ depot }, { rows }) => ({
          lines: Object.fromEntries(rows.lines.map((key) => [key, { depot }])),
        }),
      },
      total: { value: ({ lines }) => lines.reduce((sum, line) => sum + line.net, 0) },
      lines: { each: pick(lineRules, ruleOrder) },
    },
  });
const openingLines = [
  { quantity: 2, price: 10 },
  { price: 5, discount: 1, depot: "South" },
];
const published = ({ values, fieldStates }) => ({ values, fieldStates });
const scenario = (definition) => {
  const session = createSession(definition, { initial: { rate: 2, lines: openingLines } });
  const [first, second] = keysOf(session);
  const [added] = session.add("lines", [{ quantity: 0, price: 3, lot: "L3" }], { at: 0 });
  const seen = [published(session.getSnapshot())];
  for (const operation of [
    () => session.row("lines", first).edit("quantity", 4),
    () => session.edit("depot", "North"),
    () => session.patch({ rate: 3, lines: { [second]: { lot: "Z", price: 7 } } }),
    () => session.move("lines", added, 2),
    () => session.remove("lines", [first]),
    () => session.row("lines", added).edit("depot", "East"),
  ]) {
    operation();
    seen.push(published(session.getSnapshot()));
  }
  return seen;
};

test("Permuting the order of row fields and each entries leaves values and states unchanged in a scenario with no conflicts", () => {
  const expected = scenario(ordered(Object.keys(lineTypes), Object.keys(lineRules)));
  assert.deepEqual(expected.at(-1).values, {
    rate: 3,
    depot: "North",
    total: 20,
    lines: [
      { quantity: 1, price: 7, discount: 1, amount: 21, net: 20, depot: "North", lot: "Z" },
      { quantity: 0, price: 3, discount: 0, amount: 0, net: 0, depot: "East", lot: "" },
    ],
  });
  assert.equal(expected[0].fieldStates.lines[0].discount.disabled, true);
  const ruleOrders = permutations(Object.keys(lineRules));
  const moving = ["quantity", "amount", "net", "depot", "lot"];
  for (const [index, order] of permutations(moving).entries())
    assert.deepEqual(
      scenario(ordered(["price", ...order, "discount"], ruleOrders[index % ruleOrders.length])),
      expected,
    );
});
