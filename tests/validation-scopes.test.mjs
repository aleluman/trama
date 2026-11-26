import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const fields = {
  title: field.text({ required: "Enter the title" }),
  note: field.text(),
};
const lines = { lines: { fields: { debit: field.number(), credit: field.number() } } };
const document = (extra = {}) =>
  defineForm({
    fields,
    collections: lines,
    rules: {
      lines: {
        row: {
          error: ({ debit, credit }) =>
            (debit ?? 0) === 0 && (credit ?? 0) === 0 && "Complete the debit or credit",
        },
        collection: {
          error: ({ lines: rows }) => rows.length === 0 && "Add at least one line",
        },
        each: { debit: { warning: ({ debit }) => (debit ?? 0) > 100 && "High debit" } },
      },
    },
    form: { warning: ({ note }) => note === "" && "No note" },
    ...extra,
  });
const counts = (scope) => [scope.errorCount, scope.warningCount];

test("each scope publishes its messages and counts targets with messages", () => {
  const session = createSession(document());
  const { form } = session.getSnapshot();
  assert.deepEqual(form.collections.lines.errors, ["Add at least one line"]);
  assert.deepEqual(counts(form.collections.lines), [1, 0]);
  assert.deepEqual(form.warnings, ["No note"]);
  assert.deepEqual(form.errors, []);
  assert.deepEqual(counts(form), [2, 1], "title, the collection, and the form's own warning");
  const [key] = session.add("lines", [{}]);
  const row = session.row("lines", key).getSnapshot();
  assert.deepEqual(row.errors, ["Complete the debit or credit"]);
  assert.deepEqual(counts(row), [1, 0]);
  assert.deepEqual(session.getSnapshot().form.collections.lines.errors, []);
  assert.deepEqual(counts(session.getSnapshot().form.collections.lines), [1, 0]);
  session.row("lines", key).edit("debit", 200);
  const edited = session.row("lines", key).getSnapshot();
  assert.deepEqual([edited.errors, counts(edited)], [[], [0, 1]]);
  assert.deepEqual(counts(session.getSnapshot().form), [1, 2]);
});

test("a field with several errors counts as one target, and own messages count as one target per scope", () => {
  const session = createSession(
    defineForm({
      fields: { title: field.text({ required: true }) },
      rules: { title: { error: [() => "One", () => "Two"] } },
      form: { error: [() => "From the form", () => "Other"] },
    }),
  );
  const { form, fieldStates } = session.getSnapshot();
  assert.deepEqual(fieldStates.title.errors, ["Required", "One", "Two"]);
  assert.deepEqual(form.errors, ["From the form", "Other"]);
  assert.equal(form.errorCount, 2);
});

test("a row message that reads the header updates counts for rows that were not written", () => {
  const session = createSession(
    defineForm({
      fields: { strict: field.checkbox(), review: field.checkbox() },
      collections: lines,
      rules: {
        lines: {
          each: {
            debit: { error: (_, { values }) => values.strict && "Check the debit" },
            credit: {
              states: (_, { values }) => ({
                credit: { warning: values.review ? "Check the credit" : undefined },
              }),
            },
          },
        },
      },
    }),
    { initial: { lines: [{}, {}] } },
  );
  const [key] = session.getSnapshot().rows.lines;
  const scopes = () => {
    const { form } = session.getSnapshot();
    const row = session.row("lines", key).getSnapshot();
    return [counts(row), counts(form.collections.lines), counts(form)];
  };
  session.edit("strict", true);
  assert.deepEqual(scopes(), [
    [1, 0],
    [2, 0],
    [2, 0],
  ]);
  session.edit("review", true);
  assert.deepEqual(scopes(), [
    [1, 1],
    [2, 2],
    [2, 2],
  ]);
  session.edit("strict", false);
  assert.deepEqual(scopes(), [
    [0, 1],
    [0, 2],
    [0, 2],
  ]);
});

test("a row snapshot publishes its own message that reads the header", () => {
  const session = createSession(
    defineForm({
      fields: { strict: field.checkbox() },
      collections: lines,
      rules: {
        lines: { row: { error: (_, { values }) => values.strict && "Check the line" } },
      },
    }),
    { initial: { lines: [{}] } },
  );
  const row = session.row("lines", session.getSnapshot().rows.lines[0]);
  const before = row.getSnapshot();
  session.edit("strict", true);
  const after = row.getSnapshot();
  assert.equal(after.values, before.values);
  assert.equal(after.fieldStates, before.fieldStates);
  assert.deepEqual([after.errors, counts(after)], [["Check the line"], [1, 0]]);
});

test("a __proto__ collection publishes its messages and counts as own properties", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: { ["__proto__"]: { fields: { code: field.text({ required: true }) } } },
    }),
    { initial: { ["__proto__"]: [{}] } },
  );
  const [key] = session.getSnapshot().rows["__proto__"];
  assert.ok(Object.hasOwn(session.getSnapshot().form.collections, "__proto__"));
  session.row("__proto__", key).edit("code", "A1");
  const { form } = session.getSnapshot();
  assert.deepEqual([counts(form), form.dirty], [[0, 0], true]);
  const collection = Object.getOwnPropertyDescriptor(form.collections, "__proto__")?.value;
  assert.deepEqual([counts(collection), collection.dirty], [[0, 0], true]);
});

test("message lists for a scope retain their identity while unchanged", () => {
  const session = createSession(document());
  const before = session.getSnapshot().form;
  session.edit("title", "Entry");
  const after = session.getSnapshot().form;
  assert.notEqual(after, before);
  assert.equal(after.warnings, before.warnings);
});

test("moving a row preserves its messages, and removing it subtracts them from the counts", () => {
  const session = createSession(document(), { initial: { lines: [{}, { debit: 5 }, {}] } });
  const [first, second, third] = session.getSnapshot().rows.lines;
  const before = session.row("lines", first).getSnapshot();
  assert.equal(session.getSnapshot().form.collections.lines.errorCount, 2);
  session.move("lines", first, 2);
  assert.equal(session.row("lines", first).getSnapshot().errors, before.errors);
  assert.equal(session.getSnapshot().form.collections.lines.errorCount, 2);
  session.remove("lines", [third]);
  assert.equal(session.getSnapshot().form.collections.lines.errorCount, 1);
  session.remove("lines", [first, second]);
  assert.deepEqual(session.getSnapshot().form.collections.lines.errors, ["Add at least one line"]);
  assert.equal(session.getSnapshot().form.collections.lines.errorCount, 1);
  session.reset();
  assert.equal(session.getSnapshot().form.collections.lines.errorCount, 2);
});

test("form state retains its identity while unchanged", () => {
  const session = createSession(document(), { initial: { lines: [{ debit: 1 }] } });
  const opened = session.getSnapshot().form;
  assert.ok(Object.isFrozen(opened) && Object.isFrozen(opened.collections));
  session.edit("note", "x");
  const noted = session.getSnapshot().form;
  assert.notEqual(noted, opened);
  assert.equal(noted.collections, opened.collections);
  session.edit("note", "y");
  assert.equal(session.getSnapshot().form, noted);
});

test("scope messages name their scope in diagnostics", () => {
  const throwsWith = (config, message) =>
    assert.throws(
      () => defineForm({ fields: {}, collections: lines, ...config }),
      new Error(message),
    );
  throwsWith(
    { rules: { lines: { row: { eror: () => "x" } } } },
    'Row rules of "lines": unknown property "eror"',
  );
  throwsWith(
    { rules: { lines: { collection: () => "x" } } },
    'Collection rules of "lines": expected an object with error or warning',
  );
  throwsWith({ form: { errors: () => "x" } }, 'Form section "form": unknown property "errors"');
  throwsWith({ form: { error: "x" } }, "Form error: expected a formula or an array of formulas");
  const session = createSession(
    defineForm({
      fields: { mode: field.text() },
      collections: lines,
      rules: { lines: { row: { error: (_, { values }) => values.mode === "row" } } },
      form: { warning: ({ mode }) => (mode === "form" ? 1 : false) },
    }),
  );
  rejects(
    session,
    () => session.edit("mode", "form"),
    "Form warning: incompatible result 1, expected a non-empty message, false or undefined",
  );
  const [key] = session.add("lines", [{}]);
  rejects(
    session,
    () => session.edit("mode", "row"),
    `Row of "lines" row "${key}" error: incompatible result true, expected a non-empty message, false or undefined`,
  );
});

test("rule sets contribute row and collection messages", () => {
  const checks = defineRules({
    fields: {},
    collections: lines,
    rules: {
      lines: {
        row: { warning: ({ credit }) => (credit ?? 0) < 0 && "Negative credit" },
        collection: { warning: ({ lines: rows }) => rows.length > 2 && "Many lines" },
      },
    },
  });
  const session = createSession(document({ include: [checks] }), {
    initial: { lines: [{ credit: -1 }, {}, {}] },
  });
  const [key] = session.getSnapshot().rows.lines;
  assert.deepEqual(session.row("lines", key).getSnapshot().warnings, ["Negative credit"]);
  assert.deepEqual(session.getSnapshot().form.collections.lines.warnings, ["Many lines"]);
});
