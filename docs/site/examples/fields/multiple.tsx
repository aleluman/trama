import { defineForm, field, type FormValues } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const report = defineForm({
  fields: {
    kinds: field.multiSelect({
      label: "Document types",
      options: [
        { value: "sale", label: "Sale" },
        { value: "quote", label: "Quote" },
        { value: "return", label: "Return" },
      ],
      default: ["sale"],
    }),
    allKinds: field.checkbox({ label: "All types" }),
    page: field.number({ label: "Page", default: 1 }),
  },
  rules: {
    kinds: {
      // TypeScript checks the array literal against the options without as const.
      value: ({ allKinds }) => (allKinds ? ["return", "quote", "sale"] : undefined),
      readOnly: ({ allKinds }) => allKinds && "Includes all types",
      // Changing the types changes the report, so go back to the first page.
      onChange: () => ({ page: 1 }),
    },
  },
});

// kinds holds an array of option values: readonly ("sale" | "quote" | "return")[]
export type ReportValues = FormValues<typeof report>;

export const Demo = () => {
  const editor = useFormSession(report);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="kinds" />
      <Field session={session} name="allKinds" />
      <Field session={session} name="page" />
      <SessionState session={session} />
    </>
  );
};
