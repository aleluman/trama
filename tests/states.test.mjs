import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { mapStates } from "./helpers/session.mjs";

const deliveryForm = () =>
  defineForm({
    fields: {
      delivery: field.select({
        options: [
          { value: "shipping", label: "Shipping" },
          { value: "pickup", label: "Store pickup" },
        ],
        default: "shipping",
      }),
      country: field.select({ options: [{ value: "ES", label: "Spain" }], default: "ES" }),
      city: field.text({ label: "City" }),
      useCapital: field.checkbox(),
    },
    rules: {
      delivery: {
        states: ({ delivery }) =>
          delivery === "pickup"
            ? { country: { hidden: true }, city: { hidden: true }, useCapital: { hidden: true } }
            : { city: { required: true } },
      },
    },
  });
const flags = (session, property) => mapStates(session, (state) => state[property]);

test("store pickup hides the address without clearing its values, and shipping requires the city", () => {
  const session = createSession(deliveryForm(), {
    initial: { city: "Barcelona", useCapital: true },
  });
  assert.deepEqual(flags(session, "required"), {
    delivery: false,
    country: false,
    city: true,
    useCapital: false,
  });
  assert.deepEqual(Object.values(flags(session, "hidden")), [false, false, false, false]);
  session.edit("delivery", "pickup");
  assert.deepEqual(flags(session, "hidden"), {
    delivery: false,
    country: true,
    city: true,
    useCapital: true,
  });
  assert.deepEqual(Object.values(flags(session, "required")), [false, false, false, false]);
  assert.deepEqual(session.getSnapshot().values, {
    delivery: "pickup",
    country: "ES",
    city: "Barcelona",
    useCapital: true,
  });
  session.edit("city", "Seville");
  session.edit("delivery", "shipping");
  assert.equal(session.getSnapshot().values.city, "Seville");
  assert.deepEqual(Object.values(flags(session, "hidden")), [false, false, false, false]);
  assert.equal(session.getSnapshot().fieldStates.city.required, true);
  session.edit("delivery", "pickup");
  session.reset();
  assert.equal(session.getSnapshot().fieldStates.city.required, true);
  assert.equal(session.getSnapshot().fieldStates.city.hidden, false);
});

test("each evaluation replaces the entire patch, omitting a target or property withdraws it, and undefined withdraws everything", () => {
  const definition = defineForm({
    fields: {
      step: field.number({ default: 0 }),
      a: field.text({ label: "A" }),
      b: field.text({ label: "B" }),
    },
    rules: {
      step: {
        states: ({ step }) =>
          [
            { a: { hidden: true, readOnly: "Step 0", label: "A0" }, b: { required: true } },
            { a: { readOnly: "Step 1" } },
            { b: { disabled: true, label: "B2" } },
            undefined,
            {},
            { a: undefined, b: { hidden: false, readOnly: undefined } },
          ][step ?? 0],
      },
    },
  });
  const session = createSession(definition);
  const view = () => {
    const { a, b } = session.getSnapshot().fieldStates;
    return {
      a: [a.hidden, a.readOnly, a.label, a.reasons],
      b: [b.required, b.disabled, b.label, b.hidden],
    };
  };
  assert.deepEqual(view(), {
    a: [true, true, "A0", ["Step 0"]],
    b: [true, false, "B", false],
  });
  session.edit("step", 1);
  assert.deepEqual(view(), { a: [false, true, "A", ["Step 1"]], b: [false, false, "B", false] });
  session.edit("step", 2);
  assert.deepEqual(view(), { a: [false, false, "A", []], b: [false, true, "B2", false] });
  for (const step of [3, 4, 5]) {
    session.edit("step", step);
    assert.deepEqual(view(), { a: [false, false, "A", []], b: [false, false, "B", false] });
  }
  session.reset();
  assert.deepEqual(view(), { a: [true, true, "A0", ["Step 0"]], b: [true, false, "B", false] });
});

test("a patch can include its own field without reading the field that drives it, and its entry determines its order", () => {
  const definition = defineForm({
    fields: { mode: field.text(), note: field.text({ label: "Note" }), total: field.number() },
    rules: {
      note: { label: ({ mode }) => (mode === "" ? undefined : "Own") },
      // Under total, but reads mode; declared after the entry of note.
      total: {
        states: ({ mode }) =>
          mode === "" ? undefined : { total: { readOnly: mode }, note: { label: "From patch" } },
      },
    },
  });
  const session = createSession(definition);
  session.edit("mode", "Closed");
  const { total, note } = session.getSnapshot().fieldStates;
  assert.deepEqual([total.readOnly, total.reasons], [true, ["Closed"]]);
  assert.equal(note.label, "From patch", "The patch is declared after the note formula");
});

test("the patch is read once during evaluation, and later changes to the returned object leave state unchanged", () => {
  const patch = { note: { hidden: true } };
  const definition = defineForm({
    fields: { on: field.checkbox(), note: field.text() },
    rules: { on: { states: ({ on }) => (on ? patch : undefined) } },
  });
  const session = createSession(definition);
  session.edit("on", true);
  patch.note.hidden = false;
  patch.note.required = true;
  assert.equal(session.getSnapshot().fieldStates.note.hidden, true);
  assert.equal(session.getSnapshot().fieldStates.note.required, false);
  session.edit("on", false);
  session.edit("on", true);
  assert.deepEqual(
    [
      session.getSnapshot().fieldStates.note.hidden,
      session.getSnapshot().fieldStates.note.required,
    ],
    [false, true],
  );
});

test("multiple patches combine their contributions with the target field's properties", () => {
  const definition = defineForm({
    fields: {
      a: field.checkbox(),
      b: field.checkbox(),
      note: field.text({ required: true }),
    },
    rules: {
      a: { states: ({ a }) => (a ? { note: { hidden: true, disabled: "A" } } : undefined) },
      note: { hidden: ({ b }) => b },
      b: { states: ({ b }) => ({ note: { disabled: b && "B", required: false } }) },
    },
  });
  const session = createSession(definition);
  const note = () => session.getSnapshot().fieldStates.note;
  session.edit("a", true);
  session.edit("b", true);
  assert.deepEqual(
    [note().hidden, note().disabled, note().required, note().reasons],
    [true, true, true, ["A", "B"]],
  );
  session.edit("a", false);
  assert.deepEqual(
    [note().hidden, note().reasons],
    [true, ["B"]],
    "Its formula keeps hidden in effect",
  );
  session.edit("b", false);
  assert.deepEqual([note().hidden, note().disabled, note().required], [false, false, true]);
});
