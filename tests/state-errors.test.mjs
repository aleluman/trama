import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { failsAt, rejects } from "./helpers/session.mjs";

const fields = () => ({
  customer: field.text(),
  confirmed: field.checkbox(),
  country: field.select({ options: [{ value: "ES", label: "Spain" }] }),
  note: field.text({ label: "Note" }),
});

test("a throwing state formula rejects opening, editing, and reset without publishing or losing contributions", () => {
  const boom = new Error("State unavailable");
  let broken = false;
  const fail = ({ customer }) => {
    if (broken || customer === "Failure") throw boom;
  };
  for (const [entry, label] of [
    [{ readOnly: [({ confirmed }) => confirmed && "Confirmed", fail] }, "readOnly[1]"],
    [{ readOnly: ({ confirmed }) => confirmed && "Confirmed", hidden: fail }, "hidden"],
    [{ readOnly: ({ confirmed }) => confirmed && "Confirmed", required: [fail] }, "required[0]"],
    [{ readOnly: ({ confirmed }) => confirmed && "Confirmed", label: fail }, "label"],
    [{ readOnly: ({ confirmed }) => confirmed && "Confirmed", placeholder: fail }, "placeholder"],
  ]) {
    broken = false;
    const definition = defineForm({ fields: fields(), rules: { note: entry } });
    const message = `Field "note" ${label}: formula failed: State unavailable`;
    assert.throws(() => createSession(definition, { initial: { customer: "Failure" } }), {
      message,
      cause: boom,
    });
    const session = createSession(definition, { initial: { confirmed: true } });
    rejects(session, () => session.edit("customer", "Failure"), message, boom);
    assert.equal(session.getSnapshot().values.customer, "");
    assert.deepEqual(session.getSnapshot().fieldStates.note.reasons, ["Confirmed"]);
    broken = true;
    rejects(session, () => session.reset(), message, boom);
    broken = false;
    session.edit("confirmed", false);
    assert.equal(
      session.getSnapshot().fieldStates.note.readOnly,
      false,
      "The previous contribution remained",
    );
    session.reset();
    assert.equal(session.getSnapshot().fieldStates.note.readOnly, true);
  }
});

test("a result outside the property domain rejects the operation and names the property or element", () => {
  const reason = "expected a boolean, a non-empty reason or undefined";
  const flag = "expected a boolean or undefined";
  const required = "expected a boolean, a non-empty message or undefined";
  const text = "expected a string or undefined";
  for (const [property, result, shown, expected] of [
    ["disabled", "", '""', reason],
    ["readOnly", "", '""', reason],
    ["readOnly", null, "null", reason],
    ["readOnly", 1, "1", reason],
    ["readOnly", Promise.resolve("x"), "[object Promise]", reason],
    ["hidden", 5, "5", flag],
    ["hidden", "Hidden", '"Hidden"', flag],
    ["required", null, "null", required],
    ["required", "", '""', required],
    ["required", { required: true }, "[object Object]", required],
    ["label", 5, "5", text],
    ["label", null, "null", text],
    ["label", true, "true", text],
    ["placeholder", false, "false", text],
    ["placeholder", ["E.g."], "[object Array]", text],
  ]) {
    const formula = ({ customer }) => (customer === "Ana" ? result : undefined);
    const single = property === "label" || property === "placeholder";
    const definition = defineForm({
      fields: fields(),
      rules: {
        note: { [property]: formula },
        customer: { [property]: single ? formula : [() => {}, formula] },
      },
    });
    const session = createSession(definition);
    rejects(
      session,
      () => session.edit("customer", "Ana"),
      `Field "note" ${property}: incompatible result ${shown}, ${expected}`,
    );
    if (single) continue;
    const alone = defineForm({
      fields: fields(),
      rules: { customer: { [property]: [() => {}, formula] } },
    });
    assert.throws(() => createSession(alone, { initial: { customer: "Ana" } }), {
      message: `Field "customer" ${property}[1]: incompatible result ${shown}, ${expected}`,
    });
  }
});

test("values and peek are read-only in state formulas", () => {
  for (const [property, formula] of [
    [
      "hidden",
      (values) => {
        values.note = "";
        return true;
      },
    ],
    [
      "label",
      (_, { peek }) => {
        delete peek.note;
        return "x";
      },
    ],
  ]) {
    const definition = defineForm({ fields: fields(), rules: { note: { [property]: formula } } });
    assert.throws(
      () => createSession(definition),
      (error) =>
        error.message === `Field "note" ${property}: formula failed: Formula values are readonly` &&
        error.cause instanceof TypeError,
    );
  }
});

test("value and event failures are reported before state failures; among state formulas, the first declared comes first and the lock comes last", () => {
  const definition = defineForm({
    form: { readOnly: [{ value: failsAt(5, "lock", false) }] },
    fields: {
      source: field.number(),
      total: field.number(),
      note: field.text(),
      log: field.text(),
    },
    rules: {
      log: { hidden: failsAt(4, "log", false) },
      note: {
        label: failsAt(1, "label"),
        required: [() => false, failsAt(1, "second", false)],
        readOnly: failsAt(4, "readOnly", false),
      },
      total: { value: failsAt(2, "value"), states: failsAt(5, "states") },
      source: { onChange: failsAt(3, "event") },
    },
  });
  const session = createSession(definition);
  rejects(session, () => session.edit("source", 1), 'Field "note" label: formula failed: label');
  rejects(session, () => session.edit("source", 2), 'Field "total" value: formula failed: value');
  rejects(session, () => session.edit("source", 3), 'Field "source" onChange: event failed: event');
  rejects(session, () => session.edit("source", 4), 'Field "log" hidden: formula failed: log');
  rejects(session, () => session.edit("source", 5), 'Field "total" states: formula failed: states');
  const lockOnly = defineForm({
    form: { readOnly: [{ value: () => false }, { value: failsAt(5, "lock", false) }] },
    fields: { source: field.number() },
    rules: { source: { hidden: failsAt(6, "hidden", false) } },
  });
  const locked = createSession(lockOnly);
  rejects(locked, () => locked.edit("source", 5), "Form readOnly[1]: formula failed: lock");
});

test("at runtime, defineForm rejects invalid state formulas and placeholders on checkbox and select fields", () => {
  const holes = [() => true];
  holes[2] = () => false;
  for (const [entry, message] of [
    [{ readOnly: true }, 'Field "note" readOnly: expected a formula or an array of formulas'],
    [{ hidden: "yes" }, 'Field "note" hidden: expected a formula or an array of formulas'],
    [{ required: new Set() }, 'Field "note" required: expected a formula or an array of formulas'],
    [{ hidden: [() => true, null] }, 'Field "note" hidden[1]: formula must be a function'],
    [{ required: holes }, 'Field "note" required[1]: formula must be a function'],
    [{ readOnly: [undefined] }, 'Field "note" readOnly[0]: formula must be a function'],
    [{ label: "Note" }, 'Field "note" label: formula must be a function'],
    [{ label: [() => "Note"] }, 'Field "note" label: formula must be a function'],
    [{ placeholder: null }, 'Field "note" placeholder: formula must be a function'],
    [{ states: {} }, 'Field "note" states: formula must be a function'],
    [{ states: [() => ({})] }, 'Field "note" states: formula must be a function'],
  ])
    assert.throws(() => defineForm({ fields: fields(), rules: { note: entry } }), { message });
  for (const [name, type] of [
    ["confirmed", "checkbox"],
    ["country", "select"],
  ])
    for (const placeholder of [() => "E.g.", undefined])
      assert.throws(() => defineForm({ fields: fields(), rules: { [name]: { placeholder } } }), {
        message: `Field "${name}" placeholder: ${type} fields have no placeholder`,
      });
  for (const entry of [
    { readOnly: undefined, hidden: [], required: [], label: undefined },
    { placeholder: undefined, states: undefined },
  ]) {
    const session = createSession(defineForm({ fields: fields(), rules: { note: entry } }));
    assert.equal(session.getSnapshot().fieldStates.note.label, "Note");
  }
});

test("at runtime, defineForm rejects state declared on the field outside its domain", () => {
  for (const [config, message] of [
    [{ disabled: "" }, 'Field "note": disabled must be a boolean or a non-empty reason'],
    [{ readOnly: 1 }, 'Field "note": readOnly must be a boolean or a non-empty reason'],
    [{ readOnly: null }, 'Field "note": readOnly must be a boolean or a non-empty reason'],
    [{ hidden: "Hidden" }, 'Field "note": hidden must be a boolean'],
    [{ required: 0 }, 'Field "note": required must be a boolean or a non-empty message'],
  ]) {
    assert.throws(() => defineForm({ fields: { note: field.text(config) } }), { message });
    assert.throws(() => defineForm({ fields: { note: field.checkbox(config) } }), { message });
  }
  const session = createSession(
    defineForm({
      fields: { note: field.text({ disabled: undefined, hidden: false, readOnly: false }) },
    }),
  );
  assert.equal(session.getSnapshot().fieldStates.note.disabled, false);
});

test("at runtime, defineForm names form among the supported sections", () => {
  assert.throws(() => defineForm({ fields: {}, forms: {} }), {
    message:
      "Form configuration requires fields and optional collections/context/defaults/include/rules/form/outputs",
  });
});
