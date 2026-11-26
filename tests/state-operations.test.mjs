import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs, states } from "./helpers/session.mjs";

test("opening and reset give the same state for the same values, with defaults and with supplied values", () => {
  const definition = defineForm({
    fields: {
      mode: field.select({
        options: [
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Submitted" },
        ],
        default: "draft",
      }),
      city: field.text({ label: "City" }),
      note: field.text(),
    },
    rules: {
      mode: {
        states: ({ mode }) => (mode === "sent" ? { city: { readOnly: "Submitted" } } : undefined),
      },
      city: {
        required: ({ mode }) => mode === "draft",
        label: ({ mode }) => (mode === "sent" ? "Submitted city" : undefined),
        placeholder: ({ city }) => (city === "" ? "Enter the city" : undefined),
      },
      note: { hidden: ({ city }) => city === "" },
    },
    form: { readOnly: { value: ({ mode }) => mode === "sent", except: ["mode"] } },
  });
  for (const initial of [
    undefined,
    { mode: "sent" },
    { city: "Madrid" },
    { mode: "sent", city: "" },
  ]) {
    const session = createSession(definition, initial === undefined ? {} : { initial });
    const opened = structuredClone(states(session));
    session.edit("mode", session.getSnapshot().values.mode === "sent" ? "draft" : "sent");
    session.edit("city", session.getSnapshot().values.city === "" ? "Tokyo" : "");
    assert.notDeepEqual(states(session), opened, "The edits changed the opening state");
    session.reset();
    assert.deepEqual(states(session), opened);
    assert.deepEqual(
      states(createSession(definition, { initial: session.getSnapshot().values })),
      opened,
    );
  }
});

test("state formulas run at opening, when a values read changes, and on every reset; peek does not trigger them", () => {
  const runs = [];
  const counted = (name, formula) => (values, tools) => {
    runs.push(name);
    return formula(values, tools);
  };
  const definition = defineForm({
    fields: { a: field.number(), b: field.number(), note: field.text(), other: field.text() },
    rules: {
      a: {
        states: counted("states", ({ a }, { peek: { b } }) =>
          a !== null && a === b ? { note: { hidden: true } } : undefined,
        ),
      },
      note: {
        hidden: counted("hidden", ({ a }) => a === 1),
        required: [counted("required", ({ b }) => b === -1)],
        label: counted("label", ({ a }) => (a === -1 ? "Never" : undefined)),
        placeholder: counted("placeholder", (_, { peek }) => (peek.b === 2 ? "Two" : undefined)),
        readOnly: counted("readOnly", () => false),
      },
    },
    form: { readOnly: { value: counted("lock", ({ b }) => b === -1) } },
  });
  const session = createSession(definition);
  const all = ["hidden", "label", "lock", "placeholder", "readOnly", "required", "states"];
  assert.deepEqual(runs.toSorted(), all);
  runs.length = 0;
  session.edit("a", 1);
  assert.deepEqual(runs.toSorted(), ["hidden", "label", "states"]);
  runs.length = 0;
  session.edit("b", 2);
  assert.deepEqual(
    runs.toSorted(),
    ["lock", "required"],
    "peek does not trigger states or placeholder",
  );
  assert.equal(states(session).note.placeholder, undefined);
  assert.equal(states(session).note.hidden, true);
  runs.length = 0;
  session.edit("other", "x");
  session.edit("b", 2);
  assert.deepEqual(runs, [], "Nothing is evaluated without changed reads or a difference");
  session.reset();
  assert.deepEqual(runs.toSorted(), all);
  assert.equal(states(session).note.hidden, false);
});

test("state formulas read the final values of the operation and can read their own field", () => {
  const seen = [];
  const definition = defineForm({
    fields: {
      source: field.number(),
      total: field.number(),
      status: field.text(),
      note: field.text(),
    },
    rules: {
      note: {
        hidden: ({ total, status }) => {
          seen.push([total, status]);
          return total === 20 && status === "ready";
        },
        label: ({ note }) => (note === "" ? undefined : `Note: ${note}`),
      },
      source: {
        states: ({ total, source }) => {
          seen.push([total, source]);
          return total === 20 ? { source: { readOnly: "Calculated" } } : undefined;
        },
      },
      total: { value: ({ source }) => (source ?? 0) * 10 },
    },
    form: { readOnly: { value: ({ total }) => (seen.push([total]), false) } },
  });
  const session = createSession(definition);
  // status is written by an event of source, declared later than note.
  const withEvent = defineForm({
    fields: { status: field.text(), note: field.text(), source: field.number() },
    rules: {
      note: { hidden: ({ status }) => (seen.push(["status", status]), status === "ready") },
      source: { onChange: ({ source }) => ({ status: source === 2 ? "ready" : "" }) },
    },
  });
  const other = createSession(withEvent);
  seen.length = 0;
  session.edit("source", 2);
  other.edit("source", 2);
  assert.deepEqual(seen, [[20, ""], [20, 2], [20], ["status", "ready"]]);
  assert.equal(states(other).note.hidden, true);
  assert.equal(states(session).source.readOnly, true);
  session.edit("note", "Front desk");
  assert.equal(states(session).note.label, "Note: Front desk");
});

test("no flag clears values or prevents writes from session.edit, formulas, and events", () => {
  const definition = defineForm({
    fields: {
      locked: field.checkbox(),
      quantity: field.number({ default: 2, disabled: true, readOnly: "Fixed" }),
      total: field.number(),
      note: field.text({ default: "Saved", hidden: true, required: true }),
    },
    rules: {
      total: {
        value: ({ quantity }) => (quantity ?? 0) * 10,
        disabled: () => true,
        readOnly: () => "Calculated",
        hidden: () => true,
      },
      locked: { onChange: ({ locked }) => ({ note: locked ? "Locked" : "Open" }) },
      quantity: { states: () => ({ note: { readOnly: true, disabled: "Hidden" } }) },
    },
    form: { readOnly: { value: ({ locked }) => locked && "Lock" } },
    outputs: ({ output }) => ({ note: output(({ note }) => note) }),
  });
  const session = createSession(definition);
  session.edit("locked", true);
  assert.equal(session.getSnapshot().values.note, "Locked", "An event writes to a hidden field");
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 30, "A formula writes to a locked field");
  session.edit("total", 7);
  session.edit("note", "Edited");
  assert.deepEqual(session.getSnapshot().values, {
    locked: true,
    quantity: 3,
    total: 7,
    note: "Edited",
  });
  const { note, total, quantity } = states(session);
  assert.deepEqual(
    [note.hidden, note.disabled, note.readOnly, total.hidden, quantity.readOnly],
    [true, true, true, true, true],
  );
  assert.equal(currentOutputs(session).note, "Edited", "A hidden field keeps its value in outputs");
});

const identityForm = () =>
  defineForm({
    fields: {
      on: field.checkbox(),
      hide: field.checkbox(),
      text: field.text(),
      note: field.text({ label: "Note" }),
      other: field.text(),
    },
    rules: {
      note: {
        readOnly: ({ on }) => on && "Reason",
        hidden: ({ hide }) => hide,
        label: ({ text }) => (text === "" ? undefined : "Note"),
      },
      text: { states: ({ text }) => ({ other: { label: text === "x" ? "X" : undefined } }) },
    },
  });

test("a field state object and its reasons retain their identity while unchanged", () => {
  const session = createSession(identityForm());
  const opened = states(session);
  // An edit changes the state of its field, which is now dirty, and no other.
  session.edit("other", "no state");
  const edited = states(session);
  assert.equal(edited.other.dirty, true);
  for (const name of ["on", "hide", "text", "note"])
    assert.equal(edited[name], opened[name], "No state formula read other");
  session.edit("text", "y");
  for (const name of ["on", "hide", "note", "other"])
    assert.equal(states(session)[name], edited[name], "label and states returned the same result");
  const written = states(session);
  session.edit("on", true);
  const locked = states(session);
  assert.notEqual(locked.note, opened.note);
  for (const name of ["hide", "text", "other"]) assert.equal(locked[name], written[name]);
  session.edit("hide", true);
  assert.notEqual(states(session).note, locked.note);
  assert.equal(states(session).note.reasons, locked.note.reasons, "The reasons did not change");
  session.edit("hide", false);
  const note = states(session).note;
  session.edit("text", "x");
  assert.notEqual(states(session).other, opened.other);
  assert.equal(states(session).note, note, "note had an active contribution and did not change");
  assert.equal(states(session).note.reasons, locked.note.reasons);
});

test("fieldStates retains its identity if no field changed, including on reset, and everything is read-only", () => {
  const session = createSession(identityForm());
  const opened = states(session);
  for (const item of Object.values(opened)) assert.ok(Object.isFrozen(item.reasons));
  session.edit("on", true);
  const before = states(session);
  session.reset();
  assert.deepEqual(states(session), opened);
  assert.equal(states(session).on, opened.on, "Returning to the baseline keeps the same object");
  assert.notEqual(before.on, opened.on);
  session.reset();
  const reset = states(session);
  session.reset();
  assert.equal(states(session), reset, "A reset with no state changes preserves fieldStates");
  assert.throws(() => {
    reset.note.hidden = true;
  }, TypeError);
  assert.throws(() => {
    reset.note.reasons.push("x");
  }, TypeError);
  assert.throws(() => {
    reset.note = {};
  }, TypeError);
});
