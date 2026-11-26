import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects, states } from "./helpers/session.mjs";

const period = () =>
  defineForm({
    fields: { since: field.date(), until: field.date(), note: field.text() },
    rules: {
      until: {
        error: ({ since, until }) =>
          since !== null &&
          until !== null &&
          since > until &&
          "The end date must be on or after the start date",
      },
      note: { warning: [({ note }) => note.length > 3 && "Long", () => "Long", () => false] },
    },
  });

test("rule error and warning messages are published on their field in order and without duplicates", () => {
  const session = createSession(period());
  assert.deepEqual(states(session).until.errors, []);
  assert.deepEqual(states(session).note.warnings, ["Long"]);
  session.edit("since", "2026-10-02");
  session.edit("until", "2026-10-01");
  assert.deepEqual(states(session).until.errors, [
    "The end date must be on or after the start date",
  ]);
  assert.deepEqual(states(session).until.warnings, []);
  assert.equal(session.getSnapshot().values.until, "2026-10-01");
  session.edit("note", "long");
  assert.deepEqual(states(session).note.warnings, ["Long"]);
  session.edit("until", "2026-10-03");
  assert.deepEqual(states(session).until.errors, []);
});

test("a field whose messages do not change retains its state", () => {
  const session = createSession(period());
  const before = states(session).note;
  session.edit("since", "2026-10-02");
  assert.equal(states(session).note, before);
  assert.ok(Object.isFrozen(states(session).until.errors));
});

const withError = (error) =>
  createSession(defineForm({ fields: { note: field.text() }, rules: { note: { error } } }));

test("a message is nonempty text; false and undefined remove the contribution", () => {
  assert.deepEqual(states(withError(() => false)).note.errors, []);
  assert.deepEqual(states(withError(() => {})).note.errors, []);
  assert.throws(
    () => withError(() => true),
    new Error(
      'Field "note" error: incompatible result true, expected a non-empty message, false or undefined',
    ),
  );
  assert.throws(
    () => withError(() => ""),
    new Error(
      'Field "note" error: incompatible result "", expected a non-empty message, false or undefined',
    ),
  );
  const session = withError(({ note }) => (note === "x" ? 1 : false));
  rejects(
    session,
    () => session.edit("note", "x"),
    'Field "note" error: incompatible result 1, expected a non-empty message, false or undefined',
  );
});

test("a states patch contributes error and warning to multiple fields", () => {
  const session = createSession(
    defineForm({
      fields: { since: field.date(), until: field.date(), note: field.text() },
      rules: {
        since: {
          states: ({ since }) => ({
            until: { error: since === null ? "Choose the start date first" : undefined },
            note: { warning: "Check the note" },
          }),
        },
      },
    }),
  );
  assert.deepEqual(states(session).until.errors, ["Choose the start date first"]);
  assert.deepEqual(states(session).note.warnings, ["Check the note"]);
  session.edit("since", "2026-10-01");
  assert.deepEqual(states(session).until.errors, []);
  assert.throws(
    () =>
      createSession(
        defineForm({
          fields: { note: field.text() },
          rules: { note: { states: () => ({ note: { warning: true } }) } },
        }),
      ),
    new Error(
      'Field "note" states: incompatible warning true for field "note", expected a non-empty message, false or undefined',
    ),
  );
});

test("required accepts a message in the definition, rules, and patches; the flag is their logical OR", () => {
  const session = createSession(
    defineForm({
      fields: {
        since: field.date({ required: "Choose the period" }),
        codes: field.text(),
        ids: field.text(),
      },
      rules: {
        codes: { required: [({ ids }) => ids === "" && "Choose at least one code", () => false] },
        ids: {
          states: ({ codes }) => ({ ids: { required: codes === "" ? "Choose IDs" : undefined } }),
        },
      },
    }),
  );
  assert.equal(states(session).since.required, true);
  assert.equal(states(session).codes.required, true);
  assert.equal(states(session).ids.required, true);
  session.edit("ids", "1");
  assert.equal(states(session).codes.required, false);
  assert.throws(
    () => defineForm({ fields: { since: field.date({ required: "" }) } }),
    new Error('Field "since": required must be a boolean or a non-empty message'),
  );
  assert.throws(
    () =>
      createSession(
        defineForm({ fields: { note: field.text() }, rules: { note: { required: () => null } } }),
      ),
    new Error(
      'Field "note" required: incompatible result null, expected a boolean, a non-empty message or undefined',
    ),
  );
});

test("row cells publish messages from each", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: { lines: { fields: { quantity: field.number() } } },
      rules: {
        lines: {
          each: {
            quantity: { warning: ({ quantity }) => (quantity ?? 0) > 100 && "More than 100 units" },
          },
        },
      },
    }),
    { initial: { lines: [{ quantity: 1 }, { quantity: 200 }] } },
  );
  const [first, second] = states(session).lines;
  assert.deepEqual(first.quantity.warnings, []);
  assert.deepEqual(second.quantity.warnings, ["More than 100 units"]);
});

test("the form lock preserves messages", () => {
  const session = createSession(
    defineForm({
      fields: { note: field.text() },
      rules: { note: { error: () => "Missing" } },
      form: { readOnly: { value: () => true } },
    }),
  );
  assert.equal(states(session).note.readOnly, true);
  assert.deepEqual(states(session).note.errors, ["Missing"]);
});
