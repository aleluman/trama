import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf as keys } from "./session.mjs";

// A voucher with lines: a formula per cell that reads the header, own
// messages of each row and of the collection, and a second collection.
export const voucher = defineForm({
  fields: { note: field.text(), rate: field.number() },
  collections: {
    lines: {
      fields: {
        debit: field.number(),
        credit: field.number(),
        amount: field.number(),
        memo: field.text(),
      },
    },
    taxes: { fields: { code: field.text() } },
  },
  rules: {
    lines: {
      row: {
        error: ({ debit, credit }) =>
          (debit ?? 0) === 0 && (credit ?? 0) === 0 && "Enter a debit or credit",
        warning: ({ memo }) => memo === "w" && "Test memo",
      },
      collection: { error: ({ lines }) => lines.length === 0 && "Add at least one line" },
      each: { amount: { value: ({ debit }, { values }) => (debit ?? 0) * (values.rate ?? 1) } },
    },
  },
});
export const initial = {
  rate: 2,
  lines: [{ debit: 10 }, { debit: 20 }, { credit: 5 }],
  taxes: [{ code: "TAX" }],
};
export const open = (values = {}) => createSession(voucher, { initial: { ...initial, ...values } });
export { keys };
// The snapshot of the row at a position.
export const rowAt = (session, index, collection = "lines") =>
  session.row(collection, keys(session, collection)[index]).getSnapshot();
// Where a message goes: a cell, a row or the collection of lines.
export const cell = (session, index, name, message) => ({
  collection: "lines",
  key: keys(session)[index],
  field: name,
  message,
});
export const row = (session, index, message) => ({
  collection: "lines",
  key: keys(session)[index],
  message,
});
export const lines = (message) => ({ collection: "lines", message });
// The counts of errors of the form, of the lines and of each row.
export const errorCounts = (session) => {
  const { form } = session.getSnapshot();
  return [
    form.errorCount,
    form.collections.lines.errorCount,
    keys(session).map((_, index) => rowAt(session, index).errorCount),
  ];
};
// What each scope publishes of the externals: the collection, each row and
// each cell that has some.
export const externals = (session) => {
  const found = {};
  const { form } = session.getSnapshot();
  if (form.externalErrors.length > 0) found.form = form.externalErrors;
  if (form.collections.lines.externalErrors.length > 0)
    found.lines = form.collections.lines.externalErrors;
  for (const [index] of keys(session).entries()) {
    const snapshot = rowAt(session, index);
    if (snapshot.externalErrors.length > 0) found[index] = snapshot.externalErrors;
    for (const [name, state] of Object.entries(snapshot.fieldStates))
      if (state.externalErrors.length > 0) found[`${index}.${name}`] = state.externalErrors;
  }
  return found;
};
