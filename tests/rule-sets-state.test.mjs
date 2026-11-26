import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSession,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
} from "trama-forms/core";

// The state properties accumulate across the sequence: disabled, readOnly,
// hidden, required, label, placeholder and states contribute from every set
// and from rules, in the order of the sequence, as the contributions of one
// field do in rules.

const fields = {
  mode: coreField.text(),
  note: coreField.text({ label: "Note", placeholder: "Write" }),
  other: coreField.text(),
};
const set = (rules) => coreRules({ fields, rules });
const stateOf = (session, name = "note") => session.getSnapshot().fieldStates[name];
const flagsOf = ({ disabled, readOnly, hidden, required, reasons }) => ({
  disabled,
  readOnly,
  hidden,
  required,
  reasons,
});
// The same form written inline and with its contributions split across sets.
const pair = (inline, sources) => [
  createSession(coreForm({ fields, rules: inline })),
  createSession(coreForm({ fields, ...sources })),
];

const blocked = ({ mode }) => mode === "a" && "Blocked";
const locked = ({ mode }) => mode !== "" && "Closed";
test("The four flags combine contributions from each source, and reasons keep their first position", () => {
  const [inline, composed] = pair(
    {
      note: {
        disabled: [blocked, locked, blocked],
        readOnly: [locked],
        hidden: [({ mode }) => mode === "h"],
        required: [({ mode }) => mode === "r", () => false],
      },
    },
    {
      include: [
        set({ note: { disabled: blocked, hidden: ({ mode }) => mode === "h" } }),
        set({ note: { disabled: [locked], required: ({ mode }) => mode === "r" } }),
      ],
      rules: { note: { disabled: blocked, readOnly: locked, required: () => false } },
    },
  );
  for (const mode of ["", "a", "b", "h", "r"]) {
    inline.edit("mode", mode);
    composed.edit("mode", mode);
    assert.deepEqual(flagsOf(stateOf(composed)), flagsOf(stateOf(inline)));
  }
  composed.edit("mode", "a");
  assert.deepEqual(stateOf(composed).reasons, ["Blocked", "Closed"]);
  composed.edit("mode", "b");
  assert.deepEqual(stateOf(composed).reasons, ["Closed"]);
});

test("The last label or text placeholder in the sequence wins, with undefined falling back to the previous one and ultimately to the definition", () => {
  const session = createSession(
    coreForm({
      fields,
      include: [
        set({ note: { label: ({ mode }) => (mode === "" ? undefined : "First") } }),
        set({
          note: {
            label: ({ mode }) => (mode === "b" ? "Second" : undefined),
            placeholder: () => "From the rule set",
          },
        }),
      ],
      rules: { note: { label: ({ mode }) => (mode === "c" ? "Inline" : undefined) } },
    }),
  );
  const labels = [];
  for (const mode of ["", "a", "b", "c", ""]) {
    session.edit("mode", mode);
    labels.push(stateOf(session).label);
  }
  assert.deepEqual(labels, ["Note", "First", "Second", "Inline", "Note"]);
  assert.equal(stateOf(session).placeholder, "From the rule set");
});

test("states accumulates from each source after the states the field declares", () => {
  const session = createSession(
    coreForm({
      fields: { ...fields, flag: coreField.checkbox({ disabled: "Always" }) },
      include: [
        coreRules({
          fields,
          rules: {
            mode: {
              states: ({ mode }) => ({
                note: { hidden: mode === "x", label: "From the rule set" },
              }),
            },
          },
        }),
      ],
      rules: {
        other: { states: ({ mode }) => ({ note: { readOnly: mode === "x" && "Read-only" } }) },
      },
    }),
  );
  session.edit("mode", "x");
  const { hidden, readOnly, label, reasons } = stateOf(session);
  assert.deepEqual(
    [hidden, readOnly, label, reasons],
    [true, true, "From the rule set", ["Read-only"]],
  );
  assert.deepEqual(stateOf(session, "flag").reasons, ["Always"]);
  session.edit("mode", "");
  assert.deepEqual([stateOf(session).hidden, stateOf(session).readOnly], [false, false]);
});

test("The form lock appears once after all sources", () => {
  const session = createSession(
    coreForm({
      fields,
      include: [set({ note: { readOnly: () => "From the rule set" } })],
      form: {
        readOnly: { value: ({ mode }) => mode === "locked" && "Locked", except: ["mode"] },
      },
    }),
  );
  assert.deepEqual(stateOf(session).reasons, ["From the rule set"]);
  session.edit("mode", "locked");
  assert.deepEqual(stateOf(session).reasons, ["From the rule set", "Locked"]);
  assert.deepEqual(stateOf(session, "other").reasons, ["Locked"]);
  assert.equal(stateOf(session, "mode").readOnly, false);
});

test("In rows, contributions from each source follow added and moved rows and follow reset", () => {
  const lines = { lines: { fields: { kind: coreField.text(), amount: coreField.number() } } };
  const rowSet = (each) => coreRules({ collections: lines, rules: { lines: { each } } });
  const definition = coreForm({
    fields: {},
    collections: lines,
    include: [rowSet({ amount: { hidden: ({ kind }) => kind === "h" } })],
    rules: { lines: { each: { amount: { disabled: ({ kind }) => kind === "d" && "No amount" } } } },
  });
  const session = createSession(definition, { initial: { lines: [{ kind: "h" }, { kind: "d" }] } });
  const amountOf = () =>
    session.getSnapshot().rows.lines.map((key) => {
      const { hidden, reasons } = session.row("lines", key).getSnapshot().fieldStates.amount;
      return [hidden, reasons];
    });
  const blank = [true, []];
  const disabled = [false, ["No amount"]];
  assert.deepEqual(amountOf(), [blank, disabled]);
  const [added] = session.add("lines", [{ kind: "d" }], { at: 0 });
  session.move("lines", added, 2);
  assert.deepEqual(amountOf(), [blank, disabled, disabled]);
  session.row("lines", session.getSnapshot().rows.lines[0]).edit("kind", "d");
  assert.deepEqual(amountOf()[0], disabled);
  session.reset();
  assert.deepEqual(amountOf(), [blank, disabled]);
});

test("A failing rule set contribution names its location, while a failing inline contribution omits it", () => {
  const boom = new Error("No data");
  const failing = () => {
    throw boom;
  };
  const session = createSession(
    coreForm({
      fields,
      include: [
        false,
        set({ note: { hidden: [() => false, ({ mode }) => mode === "x" && failing()] } }),
      ],
    }),
  );
  assert.throws(() => session.edit("mode", "x"), {
    message: 'Field "note" hidden[1] (include[1]): formula failed: No data',
  });
  const inline = createSession(
    coreForm({ fields, rules: { note: { readOnly: ({ mode }) => mode === "x" && failing() } } }),
  );
  assert.throws(() => inline.edit("mode", "x"), {
    message: 'Field "note" readOnly: formula failed: No data',
  });
});
