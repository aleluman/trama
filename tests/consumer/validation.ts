// Messages of fields: error and warning in the entries of rules, of each and
// of states patches, and required with a message, inferred without annotations.
import { createSession, declareContext, defineForm, defineRules, field } from "trama-forms/core";

export const period = defineForm({
  fields: {
    since: field.date({ label: "From", required: "Choose the period" }),
    until: field.date({ label: "To", required: true }),
    codes: field.text(),
    note: field.text(),
  },
  collections: { lines: { fields: { quantity: field.number(), debit: field.number() } } },
  rules: {
    until: {
      error: ({ since, until }) =>
        since !== null &&
        until !== null &&
        since > until &&
        "The end date must be on or after the start date",
    },
    codes: { required: ({ note }) => note === "" && "Choose at least one code" },
    note: {
      warning: [({ note }) => note.length > 200 && "Long note", () => {}],
      states: ({ note }) => ({
        codes: { error: note === "x" ? "Invalid code" : undefined, warning: false },
        since: { required: "Choose a start date" },
      }),
    },
    lines: {
      each: {
        quantity: {
          warning: ({ quantity }) => (quantity ?? 0) > 100 && "More than 100 units",
          error: [({ quantity }, { values }) => quantity === 0 && values.note === "" && "Zero"],
          required: () => "Enter the quantity",
        },
      },
    },
  },
});

const states = createSession(period).getSnapshot().fieldStates;
export const errors: readonly string[] = states.until.errors;
export const warnings: readonly string[] = states.lines[0]?.quantity.warnings ?? [];

defineForm({
  fields: { note: field.text() },
  // @ts-expect-error error takes a text, false or undefined
  rules: { note: { error: () => true } },
});
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error error messages cannot be empty
  rules: { note: { error: () => "" } },
});
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error warning messages cannot be empty
  rules: { note: { warning: [() => "Long", () => ""] } },
});
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error required messages cannot be empty
  rules: { note: { required: () => "" } },
});
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error error messages cannot be empty
  rules: { note: { states: () => ({ note: { error: "" } }) } },
});
defineForm({
  fields: {},
  collections: { lines: { fields: { quantity: field.number() } } },
  // @ts-expect-error required messages cannot be empty
  rules: { lines: { each: { quantity: { required: () => "" } } } },
});

// Messages of rows, collections and the form: a row reads its values, a
// collection and the form read the header. The snapshot gives their states.
export const ledger = defineForm({
  fields: { note: field.text() },
  collections: { lines: { fields: { debit: field.number(), credit: field.number() } } },
  rules: {
    lines: {
      row: {
        error: ({ debit, credit }, { values }) =>
          (debit ?? 0) === 0 && (credit ?? 0) === 0 && values.note === "" && "Complete a line",
      },
      collection: {
        error: ({ lines }) => lines.length === 0 && "Add at least one line",
        warning: [({ lines }) => lines.length > 50 && "Many lines"],
      },
    },
  },
  form: { warning: ({ note }) => note === "" && "No note", error: [() => false] },
});
const ledgerSession = createSession(ledger);
const { form } = ledgerSession.getSnapshot();
export const scope: [readonly string[], number, number, boolean] = [
  form.collections.lines.errors,
  form.collections.lines.errorCount,
  form.warningCount,
  form.dirty,
];
const [line] = ledgerSession.add("lines", [{}]);
const row = ledgerSession.row("lines", line).getSnapshot();
export const rowScope: [readonly string[], number, boolean] | undefined = row && [
  row.errors,
  row.errorCount,
  row.dirty,
];
// @ts-expect-error The form has no collection "other"
void form.collections.other;

defineForm({
  fields: {},
  collections: { lines: { fields: { debit: field.number() } } },
  // @ts-expect-error rules of collection "lines" take each, row or collection
  rules: { lines: { rows: { error: () => "x" } } },
});
defineForm({
  fields: {},
  collections: { lines: { fields: { debit: field.number() } } },
  // @ts-expect-error row rules of "lines" take error or warning
  rules: { lines: { row: { eror: () => "x" } } },
});
defineForm({
  fields: {},
  collections: { lines: { fields: { debit: field.number() } } },
  // @ts-expect-error error messages cannot be empty
  rules: { lines: { collection: { error: () => "" } } },
});
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error warning messages cannot be empty
  form: { warning: () => "" },
});
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error error takes a text, false or undefined
  form: { error: () => true },
});

// A rule set and a context: their messages infer the same tools.
const checks = defineRules({
  fields: {},
  collections: { lines: { fields: { debit: field.number() } } },
  rules: {
    lines: {
      row: { warning: ({ debit }) => (debit ?? 0) < 0 && "Negative debit" },
      collection: { error: ({ lines }) => lines.length > 100 && "Too many lines" },
    },
  },
});
export const withContext = defineForm({
  context: declareContext<{ readonly strict: boolean }>(),
  fields: {},
  collections: { lines: { fields: { debit: field.number() } } },
  include: [checks],
  rules: {
    lines: {
      row: { error: ({ debit }, { context }) => context.strict && debit === null && "Missing" },
    },
  },
  form: { error: (_, { context }) => context.strict && "Strict" },
});
