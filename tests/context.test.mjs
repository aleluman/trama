import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, declareContext, defineForm, field } from "trama-forms/core";
import { remote } from "./helpers/remote.mjs";
import { currentOutputs } from "./helpers/session.mjs";

// The context the application passes, with nested data.
const app = () => ({ mode: "edit", company: { name: "Acme", tags: ["vip"] } });

test("declareContext() returns a frozen marker, and the session copies the context, deep freezes it, and detaches it from the application's object", () => {
  assert.equal(Object.isFrozen(declareContext()), true);
  const seen = [];
  const definition = defineForm({
    context: declareContext(),
    fields: { company: field.text() },
    rules: {
      company: {
        label: (_, tools) => {
          seen.push(tools.context);
          return tools.context.company.name;
        },
      },
    },
  });
  const authored = app();
  const session = createSession(definition, { context: authored });
  const [held] = seen;
  assert.notEqual(held, authored);
  assert.notEqual(held.company, authored.company);
  assert.notEqual(held.company.tags, authored.company.tags);
  assert.deepEqual(held, app());
  for (const value of [held, held.company, held.company.tags]) assert.ok(Object.isFrozen(value));
  for (const value of [authored, authored.company, authored.company.tags])
    assert.equal(Object.isFrozen(value), false);
  // Changing the application's object afterwards changes nothing the rules see.
  authored.mode = "view";
  authored.company.name = "Another";
  session.reset();
  assert.equal(seen.length, 2);
  assert.equal(seen[1], held);
  assert.deepEqual(held, app());
  assert.equal(session.getSnapshot().fieldStates.company.label, "Acme");
  // Frozen at every level: writing throws in strict mode.
  assert.throws(() => {
    held.mode = "view";
  }, TypeError);
  assert.throws(() => {
    held.company.name = "Another";
  }, TypeError);
  assert.throws(() => held.company.tags.push("new"), TypeError);
  assert.throws(() => delete held.mode, TypeError);
  // Its keys are not validated at runtime: any plain object is accepted.
  const other = createSession(definition, {
    context: { company: { name: "Beta" }, extra: [1, "x", true, null, undefined] },
  });
  assert.equal(other.getSnapshot().fieldStates.company.label, "Beta");
});

// A form with every family of tools: each one records what it receives.
const withTools = (declared) => {
  const received = {};
  const record = (family, result) => (_, tools) => {
    (received[family] ??= []).push(tools);
    return result;
  };
  const definition = remote.defineForm({
    ...(declared ? { context: declareContext() } : {}),
    fields: {
      a: remote.field.text(),
      b: remote.field.text(),
      flag: remote.field.checkbox(),
      customer: remote.field.async("customers"),
    },
    rules: {
      a: {
        value: record("value", "A"),
        disabled: [record("disabled[0]", false), record("disabled[1]", false)],
        readOnly: record("readOnly", false),
        hidden: record("hidden", false),
        required: record("required", false),
        label: record("label"),
        placeholder: record("placeholder"),
      },
      b: { states: record("states") },
      flag: { onChange: record("onChange") },
      customer: { params: record("params", {}) },
    },
    form: { readOnly: { value: record("lock", false) } },
    outputs: ({ output }) => ({ total: output(record("output", 1)) }),
  });
  return { definition, received };
};
const formulas = [
  "value",
  "disabled[0]",
  "disabled[1]",
  "readOnly",
  "hidden",
  "required",
  "label",
  "placeholder",
  "states",
  "lock",
  "params",
];
const families = [...formulas, "onChange", "output"];
// Opens, runs the event and resets, so every tool runs at least once.
const exercise = (definition, options) => {
  const session = createSession(definition, { scope: "acme", ...options });
  session.edit("flag", true);
  session.reset();
};
// Each family keeps its own tool next to the context.
const assertOwnTools = (received) => {
  assert.deepEqual(Object.keys(received).toSorted(), families.toSorted());
  for (const family of formulas)
    for (const tools of received[family]) assert.equal(typeof tools.peek, "object", family);
  for (const tools of received.onChange) assert.equal(typeof tools.toDefaults, "function");
  for (const tools of received.output) assert.equal(typeof tools.read, "function");
};

test("every tool receives the same frozen context throughout the session, and it cannot be changed", () => {
  const { definition, received } = withTools(true);
  exercise(definition, { context: { mode: "edit", currency: { code: "JPY" } } });
  assertOwnTools(received);
  const shared = received.value[0].context;
  assert.deepEqual(shared, { mode: "edit", currency: { code: "JPY" } });
  assert.ok(Object.isFrozen(shared) && Object.isFrozen(shared.currency));
  for (const family of families)
    for (const tools of received[family]) assert.equal(tools.context, shared, family);
  assert.throws(() => {
    received.onChange[0].context.mode = "view";
  }, TypeError);
  assert.throws(() => {
    received.output[0].context.currency.code = "MXN";
  }, TypeError);
  // Another session of the same definition receives its own context.
  const other = withTools(true);
  exercise(other.definition, { context: { mode: "view" } });
  assert.notEqual(other.received.value[0].context, shared);
  assert.deepEqual(other.received.lock[0].context, { mode: "view" });
});

test("without declared context, no tool has a context property, and the tools retain peek, toDefaults, and read", () => {
  for (const options of [{}, { context: undefined }]) {
    const { definition, received } = withTools(false);
    exercise(definition, options);
    assertOwnTools(received);
    for (const family of families)
      for (const tools of received[family]) assert.equal("context" in tools, false, family);
  }
});

test("context is not a dependency: [value, state, output] run at opening and skip unrelated edits, and reset preserves the current lifecycle", () => {
  const runs = [0, 0, 0];
  const count = (index, read) => (_, tools) => {
    runs[index]++;
    return read(tools.context.currency);
  };
  const definition = defineForm({
    context: declareContext(),
    fields: { code: field.text(), caption: field.text(), other: field.number() },
    rules: {
      code: { value: count(0, ({ code }) => code) },
      caption: { label: count(1, ({ code }) => `Currency ${code}`) },
    },
    outputs: ({ output }) => ({ rate: output(count(2, ({ taxRate }) => taxRate)) }),
  });
  const session = createSession(definition, {
    context: { currency: { code: "JPY", taxRate: 0.2 } },
  });
  const seen = () => [
    session.getSnapshot().values.code,
    session.getSnapshot().fieldStates.caption.label,
    currentOutputs(session).rate,
  ];
  assert.deepEqual(
    [runs, seen()],
    [
      [1, 1, 1],
      ["JPY", "Currency JPY", 0.2],
    ],
  );
  session.edit("other", 3);
  session.edit("caption", "Text");
  session.edit("code", "MXN");
  assert.deepEqual(runs, [1, 1, 1]);
  session.reset();
  assert.deepEqual(
    [runs, seen()],
    [
      [1, 2, 2],
      ["JPY", "Currency JPY", 0.2],
    ],
  );
});

// The date of the form is today, from the context.
const defaults = (current) => ({ date: current.today });

test("context and defaults can appear in either order and undefined is equivalent to omitting them, including in the bound defineForm", () => {
  const today = "2026-09-27";
  for (const { defineForm: define, field: kind } of [{ defineForm, field }, remote]) {
    const fields = { date: kind.text(), note: kind.text({ default: "Note" }) };
    const canonical = define({ fields, context: declareContext(), defaults });
    const reordered = define({
      outputs: ({ output }) => ({ date: output(({ date }) => date) }),
      defaults,
      rules: { note: { label: (_, tools) => tools.context.today } },
      context: declareContext(),
      fields,
    });
    for (const definition of [canonical, reordered])
      assert.deepEqual(createSession(definition, { context: { today } }).getSnapshot().values, {
        date: today,
        note: "Note",
      });
    const session = createSession(reordered, { context: { today } });
    assert.deepEqual(
      [session.getSnapshot().fieldStates.note.label, currentOutputs(session).date],
      [today, today],
    );
    const omitted = define({ context: undefined, fields, defaults: undefined });
    for (const options of [undefined, {}, { context: undefined }])
      assert.deepEqual(createSession(omitted, options).getSnapshot().values, {
        date: "",
        note: "Note",
      });
  }
});
