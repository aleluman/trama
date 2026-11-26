import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { states } from "./helpers/session.mjs";
// A state with its defaults, overridden by the given properties.
const state = (properties = {}) => ({
  disabled: false,
  readOnly: false,
  hidden: false,
  required: false,
  label: undefined,
  reasons: [],
  errors: [],
  externalErrors: [],
  warnings: [],
  dirty: false,
  touched: false,
  ...properties,
});

test("each field publishes all its state properties; text and number also publish placeholder", () => {
  const session = createSession(
    defineForm({
      fields: {
        customer: field.text({ label: "Customer", placeholder: "Name" }),
        quantity: field.number(),
        confirmed: field.checkbox({ label: "Confirmed" }),
        country: field.select({ options: [{ value: "ES", label: "Spain" }] }),
      },
    }),
  );
  assert.deepEqual(states(session), {
    customer: state({ label: "Customer", placeholder: "Name" }),
    quantity: state({ placeholder: undefined }),
    confirmed: state({ label: "Confirmed" }),
    country: state(),
  });
  assert.equal("placeholder" in states(session).confirmed, false);
  assert.equal("placeholder" in states(session).country, false);
});

test("state declared on the field is a contribution that no rule removes", () => {
  const session = createSession(
    defineForm({
      fields: {
        code: field.text({ disabled: "Auto-generated", required: true }),
        total: field.number({ readOnly: true, hidden: true }),
        confirmed: field.checkbox({ readOnly: "Read-only", disabled: false, hidden: false }),
        country: field.select({
          options: [{ value: "ES", label: "Spain" }],
          disabled: true,
          required: false,
        }),
      },
      rules: {
        code: {
          disabled: () => false,
          required: () => {},
          readOnly: ({ confirmed }) => confirmed,
        },
        total: { readOnly: () => false, hidden: [() => false, () => {}] },
        confirmed: { readOnly: () => {} },
        country: { disabled: () => false },
      },
    }),
  );
  const generated = state({
    disabled: true,
    required: true,
    errors: ["Required"],
    placeholder: undefined,
    reasons: ["Auto-generated"],
  });
  assert.deepEqual(states(session), {
    code: generated,
    total: state({ readOnly: true, hidden: true, placeholder: undefined }),
    confirmed: state({ readOnly: true, reasons: ["Read-only"] }),
    country: state({ disabled: true }),
  });
  session.edit("confirmed", true);
  assert.equal(states(session).code.readOnly, true);
  session.edit("confirmed", false);
  assert.deepEqual(states(session).code, generated);
});

// One switch per source; every source contributes the same flag to note.
const sources = () => ({
  fields: {
    byFormula: field.checkbox(),
    byElement: field.checkbox(),
    byPatch: field.checkbox(),
    byLock: field.checkbox(),
    note: field.text(),
  },
  rules: (flag) => ({
    byPatch: { states: ({ byPatch }) => (byPatch ? { note: { [flag]: true } } : undefined) },
    note: {
      [flag]: [({ byElement }) => byElement, ({ byFormula }) => (byFormula ? true : undefined)],
    },
  }),
});

test("each flag is true if any active contribution is true, and removing one does not clear it while another keeps it true", () => {
  for (const flag of ["disabled", "readOnly", "hidden", "required"]) {
    const { fields, rules } = sources();
    const session = createSession(
      defineForm({
        fields,
        rules: rules(flag),
        form: { readOnly: { value: ({ byLock }) => byLock && flag === "readOnly", except: [] } },
      }),
    );
    const switches = [
      "byFormula",
      "byElement",
      "byPatch",
      ...(flag === "readOnly" ? ["byLock"] : []),
    ];
    assert.equal(states(session).note[flag], false, `${flag} without contributions`);
    for (const name of switches) {
      session.edit(name, true);
      assert.equal(states(session).note[flag], true, `${flag} with ${name}`);
    }
    for (const other of ["disabled", "readOnly", "hidden", "required"].filter((f) => f !== flag))
      assert.equal(states(session).note[other], false, "The flags are independent");
    for (const [index, name] of switches.entries()) {
      session.edit(name, false);
      assert.equal(
        states(session).note[flag],
        index < switches.length - 1,
        `${flag} after removing ${name}`,
      );
    }
  }
});

// Reasons for note from the field, a states patch, the entry of note and the lock.
const reasonsForm = () =>
  defineForm({
    form: {
      readOnly: [
        { value: ({ locked }) => locked && "Locked" },
        { value: ({ locked }) => locked && "Review" },
      ],
    },
    fields: {
      locked: field.checkbox(),
      a: field.checkbox(),
      b: field.checkbox(),
      c: field.checkbox(),
      note: field.text({ readOnly: "Field", disabled: "Inherited" }),
    },
    rules: {
      a: {
        states: ({ a }) => (a ? { note: { disabled: "Patch", readOnly: "Field" } } : undefined),
      },
      note: {
        readOnly: [({ b }) => b && "Review", ({ b }) => b && "Second"],
        disabled: ({ c }) => c && "Third",
      },
    },
  });

test("reasons form a single list in declaration order, with no duplicates and only active contributions", () => {
  const session = createSession(reasonsForm());
  const reasons = () => states(session).note.reasons;
  assert.deepEqual(reasons(), ["Field", "Inherited"]);
  session.edit("locked", true);
  assert.deepEqual(reasons(), ["Field", "Inherited", "Locked", "Review"]);
  session.edit("c", true);
  session.edit("b", true);
  session.edit("a", true);
  assert.deepEqual(
    reasons(),
    ["Field", "Inherited", "Patch", "Review", "Second", "Third", "Locked"],
    "Field, rules entries and their properties in order, and the lock last",
  );
  session.edit("b", false);
  assert.deepEqual(reasons(), ["Field", "Inherited", "Patch", "Third", "Locked", "Review"]);
  session.edit("a", false);
  session.edit("b", true);
  assert.deepEqual(
    reasons(),
    ["Field", "Inherited", "Review", "Second", "Third", "Locked"],
    "A returning contribution regains its position",
  );
  const { locked } = states(session);
  assert.deepEqual(
    [locked.reasons, locked.readOnly, locked.disabled],
    [["Locked", "Review"], true, false],
  );
});

test("true with no reason adds no reasons, and disabled and readOnly share the list", () => {
  const session = createSession(
    defineForm({
      fields: { on: field.checkbox(), note: field.text() },
      rules: {
        note: {
          disabled: [({ on }) => on, ({ on }) => on && "Reason"],
          readOnly: [({ on }) => on && "Reason", ({ on }) => on && "Other"],
          hidden: ({ on }) => on,
        },
      },
    }),
  );
  session.edit("on", true);
  assert.deepEqual(
    states(session).note,
    state({
      disabled: true,
      readOnly: true,
      hidden: true,
      placeholder: undefined,
      reasons: ["Reason", "Other"],
    }),
  );
});

test("the definition preserves its declared state and formulas even if the author later changes their objects", () => {
  const config = { disabled: "Before" };
  const hidden = [() => false];
  const entry = { hidden, label: () => "Label" };
  const definition = defineForm({
    fields: { note: field.text(config) },
    rules: { note: entry },
  });
  config.disabled = false;
  hidden.push(() => true);
  entry.label = () => "After";
  const session = createSession(definition);
  assert.deepEqual(
    states(session).note,
    state({ disabled: true, label: "Label", placeholder: undefined, reasons: ["Before"] }),
  );
});

test("a field named __proto__ publishes its state as an own property", () => {
  const session = createSession(
    defineForm({
      fields: { ["__proto__"]: field.text({ readOnly: "Declared" }), other: field.text() },
      rules: {
        other: { states: ({ other }) => ({ ["__proto__"]: { label: other || undefined } }) },
      },
    }),
  );
  for (const label of [undefined, "Label"]) {
    if (label !== undefined) session.edit("other", label);
    const fieldStates = states(session);
    assert.deepEqual(Object.keys(fieldStates), ["__proto__", "other"]);
    assert.equal(Object.getPrototypeOf(fieldStates), Object.prototype);
    const own = Object.getOwnPropertyDescriptor(fieldStates, "__proto__").value;
    assert.deepEqual([own.label, own.reasons], [label, ["Declared"]]);
  }
});
