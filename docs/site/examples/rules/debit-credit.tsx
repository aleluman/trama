import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const entry = defineForm({
  fields: {
    debit: field.number({ label: "Debit", default: 0 }),
    credit: field.number({ label: "Credit", default: 10 }),
  },
  rules: {
    debit: { onEdit: () => ({ credit: 0 }) },
    credit: { onEdit: () => ({ debit: 0 }) },
  },
});

export const Demo = () => {
  const editor = useFormSession(entry);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="debit" />
      <Field session={session} name="credit" />
      <button type="button" onClick={() => session.patch({ debit: 30, credit: 40 })}>
        Apply patch
      </button>
      <SessionState session={session} />
    </>
  );
};
