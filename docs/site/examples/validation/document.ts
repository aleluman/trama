import { createSession, defineForm, field } from "trama-forms/core";

// A document with lines. Each line needs a debit or a credit, at least one line is
// required, and a high quantity triggers a warning.
const document = defineForm({
  fields: { reference: field.text({ label: "Reference", required: true }) },
  collections: {
    lines: {
      fields: {
        debit: field.number({ label: "Debit", min: 0 }),
        credit: field.number({ label: "Credit", min: 0 }),
        quantity: field.number({ label: "Quantity" }),
      },
    },
  },
  rules: {
    lines: {
      row: {
        error: ({ debit, credit }) =>
          (debit ?? 0) === 0 && (credit ?? 0) === 0 && "Enter a debit or a credit",
      },
      collection: { error: ({ lines }) => lines.length === 0 && "Add at least one line" },
      each: {
        quantity: { warning: ({ quantity }) => (quantity ?? 0) > 100 && "More than 100 units" },
      },
    },
  },
});

export const run = (log: (label: string, value: unknown) => void) => {
  const session = createSession(document, { initial: { reference: "F-12" } });
  const counts = (label: string) => {
    const { form } = session.getSnapshot();
    const { lines } = form.collections;
    log(label, {
      lines: {
        errors: lines.errors,
        errorCount: lines.errorCount,
        warningCount: lines.warningCount,
      },
      form: { errorCount: form.errorCount, warningCount: form.warningCount },
    });
  };
  counts("no lines");
  const [first, second] = session.add("lines", [{}, { debit: 10, quantity: 150 }]);
  if (first === undefined || second === undefined) return;
  const row = (key: typeof first) => {
    const snapshot = session.row("lines", key).getSnapshot();
    return (
      snapshot && {
        errors: snapshot.errors,
        errorCount: snapshot.errorCount,
        warningCount: snapshot.warningCount,
      }
    );
  };
  log("first line", row(first));
  log("second line", row(second));
  counts("with two lines");
  session.row("lines", first).edit("credit", -5);
  log("negative credit", session.getSnapshot().fieldStates.lines[0]?.credit.errors);
  session.row("lines", first).edit("credit", 5);
  counts("corrected");
};
