import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineForm, field } from "trama-forms/core";
import { rejects, states } from "./helpers/session.mjs";

// The validation every field has: required and the limits, with the texts of
// the application.
test("required rejects the empty value of each type with its own message or the application's", () => {
  const session = createSession(
    defineForm({
      fields: {
        name: field.text({ required: true }),
        accepted: field.checkbox({ required: "Accept the terms" }),
        amount: field.number({ required: true }),
        kinds: field.multiSelect({ options: [{ value: "a", label: "A" }], required: true }),
        note: field.text(),
      },
    }),
  );
  assert.deepEqual(states(session).name.errors, ["Required"]);
  assert.deepEqual(states(session).accepted.errors, ["Accept the terms"]);
  assert.deepEqual(states(session).amount.errors, ["Required"]);
  assert.deepEqual(states(session).kinds.errors, ["Required"]);
  assert.deepEqual(states(session).note.errors, []);
  session.edit("name", " ");
  session.edit("accepted", true);
  session.edit("amount", 0);
  session.edit("kinds", ["a"]);
  for (const name of ["name", "accepted", "amount", "kinds"])
    assert.deepEqual(states(session)[name].errors, [], name);
});

test("required uses the message from the last active contribution that supplies one; a later true does not clear it", () => {
  const session = createSession(
    defineForm({
      fields: { mode: field.text(), code: field.text({ required: "Enter the code" }) },
      rules: {
        code: {
          required: [({ mode }) => mode === "a" && "Code for A", () => true],
          error: ({ mode }) => mode === "b" && "Enter the code",
        },
      },
    }),
  );
  assert.deepEqual(states(session).code.errors, ["Enter the code"]);
  session.edit("mode", "a");
  assert.deepEqual(states(session).code.errors, ["Code for A"]);
  session.edit("mode", "b");
  assert.deepEqual(
    states(session).code.errors,
    ["Enter the code"],
    "The rule's message is not repeated",
  );
  session.edit("code", "X");
  assert.deepEqual(states(session).code.errors, ["Enter the code"], "The rule's message remains");
});

test("min and max validate nonempty values against inclusive bounds without changing them", () => {
  const session = createSession(
    defineForm({
      fields: {
        from: field.date(),
        to: field.date({ max: "2026-12-31" }),
        quantity: field.number({ min: 1, max: 10 }),
      },
      rules: { to: { min: ({ from }) => from } },
    }),
  );
  assert.deepEqual(states(session).quantity.errors, [], "null is not compared");
  session.edit("quantity", 0);
  assert.equal(session.getSnapshot().values.quantity, 0);
  assert.deepEqual(states(session).quantity.errors, ["Minimum 1"]);
  session.edit("quantity", 1);
  assert.deepEqual(states(session).quantity.errors, []);
  session.edit("quantity", 11);
  assert.deepEqual(states(session).quantity.errors, ["Maximum 10"]);
  session.edit("to", "2026-10-01");
  session.edit("from", "2026-10-02");
  assert.deepEqual(states(session).to.errors, ["Minimum 2026-10-02"], "A new minimum revalidates");
  session.edit("from", "2026-10-01");
  assert.deepEqual(states(session).to.errors, []);
});

test("createForms validation text callbacks receive the label and bound, and never receive the value", () => {
  const seen = [];
  const { defineForm: define, field: bound } = createForms({
    endpoints: [],
    messages: {
      required: (about) => (seen.push(about), `${about.label ?? "This field"} is required`),
      min: ({ type, min, label }) => `${label}: minimum ${min} (${type})`,
      max: ({ max }) => `Maximum ${max}`,
    },
  });
  const session = createSession(
    define({
      fields: {
        title: bound.text({ label: "Title", required: true }),
        price: bound.number({ label: "Price", min: 0, max: 5 }),
        note: bound.text({ required: true }),
      },
    }),
  );
  assert.deepEqual(states(session).title.errors, ["Title is required"]);
  assert.deepEqual(states(session).note.errors, ["This field is required"]);
  assert.deepEqual(seen, [{ label: "Title" }, { label: undefined }]);
  session.edit("price", -1);
  assert.deepEqual(states(session).price.errors, ["Price: minimum 0 (number)"]);
  session.edit("price", 6);
  assert.deepEqual(states(session).price.errors, ["Maximum 5"]);
});

const make = (messages) => createForms({ endpoints: [], messages });

test("createForms checks its text callbacks at creation, and a failing callback rejects the operation", () => {
  assert.throws(() => make("x"), new Error("createForms: messages must be an object"));
  assert.throws(
    () => make({ requird: () => "x" }),
    new Error('createForms messages: unknown property "requird"'),
  );
  assert.throws(
    () => make({ required: "Required" }),
    new Error("createForms messages.required must be a function"),
  );
  const empty = make({ min: () => "" });
  const form = empty.defineForm({ fields: { price: empty.field.number({ min: 0 }) } });
  const session = createSession(form);
  rejects(
    session,
    () => session.edit("price", -1),
    'Validation message min: expected a non-empty string, got ""',
  );
  const failure = new Error("missing text");
  const failing = make({
    required: () => {
      throw failure;
    },
  });
  assert.throws(
    () =>
      createSession(
        failing.defineForm({ fields: { title: failing.field.text({ required: true }) } }),
      ),
    (error) => {
      assert.equal(error.message, "Validation message required: formula failed: missing text");
      assert.equal(error.cause, failure);
      return true;
    },
  );
});

test("a lock change does not request the validation text again", () => {
  let calls = 0;
  const forms = createForms({ endpoints: [], messages: { required: () => (calls++, "Missing") } });
  const session = createSession(
    forms.defineForm({
      fields: { locked: forms.field.checkbox(), title: forms.field.text({ required: true }) },
      form: { readOnly: { value: ({ locked }) => locked, except: ["locked"] } },
    }),
  );
  assert.equal(calls, 1);
  session.edit("locked", true);
  assert.equal(states(session).title.readOnly, true);
  assert.deepEqual(states(session).title.errors, ["Missing"]);
  assert.equal(calls, 1);
});

test("editing a cell revalidates the other cells in its row whose state changed", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: { lines: { fields: { kind: field.text(), account: field.text() } } },
      rules: { lines: { each: { account: { required: ({ kind }) => kind === "entry" } } } },
    }),
    { initial: { lines: [{}] } },
  );
  const [key] = session.getSnapshot().rows.lines;
  session.row("lines", key).edit("kind", "entry");
  const [{ account }] = states(session).lines;
  assert.deepEqual([account.required, account.errors], [true, ["Required"]]);
  assert.equal(session.row("lines", key).getSnapshot().errorCount, 1);
});

test("the validation error comes first even if a rule returns the same text later", () => {
  const session = createSession(
    defineForm({
      fields: { title: field.text({ required: true }) },
      rules: { title: { error: [() => "Other", () => "Required"] } },
    }),
  );
  assert.deepEqual(states(session).title.errors, ["Required", "Other"]);
});

test("a field preserves its state while its published contents are unchanged", () => {
  const session = createSession(
    defineForm({
      fields: { mode: field.text(), name: field.text(), title: field.text({ required: true }) },
      rules: {
        name: { required: ({ mode }) => (mode === "a" ? "The name is missing" : "Enter a name") },
        title: { readOnly: ({ mode }) => mode === "b" },
      },
    }),
    { initial: { name: "Ana" } },
  );
  const before = states(session);
  session.edit("mode", "a");
  // Only the message of required changed, which a valid field does not publish.
  assert.equal(states(session).name, before.name);
  session.edit("mode", "b");
  // The lock changes the state of the empty title, and keeps its list of errors.
  assert.equal(states(session).title.readOnly, true);
  assert.equal(states(session).title.errors, before.title.errors);
});

test("rows with the same state share their state objects", () => {
  let calls = 0;
  const forms = createForms({ endpoints: [], messages: { required: () => (calls++, "Missing") } });
  const session = createSession(
    forms.defineForm({
      fields: {},
      collections: {
        lines: { fields: { a: forms.field.text({ required: true }), b: forms.field.number() } },
      },
    }),
    { initial: { lines: Array.from({ length: 1000 }, () => ({})) } },
  );
  const { lines } = states(session);
  assert.equal(lines[0].a, lines[999].a);
  assert.equal(lines[0], lines[999]);
  assert.equal(calls, 1);
});

test("an operation rejected by a validation text callback leaves no contributions for another operation to reveal", () => {
  const forms = createForms({
    endpoints: [],
    messages: {
      min: () => {
        throw new Error("missing text");
      },
    },
  });
  const session = createSession(
    forms.defineForm({
      fields: { mode: forms.field.text(), note: forms.field.text(), price: forms.field.number() },
      rules: {
        price: { min: ({ mode }) => (mode === "a" ? 0 : undefined), label: ({ note }) => note },
      },
    }),
  );
  // A first change of a contribution: the memory is no longer the opening's.
  session.edit("note", "Before");
  session.edit("price", -1);
  rejects(
    session,
    () => session.edit("mode", "a"),
    "Validation message min: formula failed: missing text",
  );
  session.edit("note", "Price");
  assert.equal(states(session).price.label, "Price");
  assert.equal(states(session).price.min, undefined);
  assert.deepEqual(states(session).price.errors, []);
});
