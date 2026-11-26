import { useState } from "react";
import { declareContext } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

type Mode = "create" | "edit";

const visit = defineForm({
  context: declareContext<{ mode: Mode }>(),
  fields: {
    customer: field.select({
      label: "Customer",
      options: [
        { value: 1, label: "Atlas Trading" },
        { value: 2, label: "Prisma Trading" },
        { value: 3, label: "Compass Trading" },
        { value: 7, label: "Lighthouse Trading" },
      ],
    }),
    // contacts returns the complete list of contacts for a customer.
    contact: field.async("contacts", { label: "Contact" }),
  },
  rules: {
    contact: {
      // The field’s list for manual selection.
      params: ({ customer }) => (customer === null ? undefined : { customer }),
      // In create mode, the query requests the same list and selects its only contact if
      // the field is still empty. In edit mode, params returns undefined and skips the query.
      query: {
        endpoint: "contacts",
        params: ({ customer }, { context }) =>
          context.mode === "create" && customer !== null ? { customer } : undefined,
        patch: (options, { values }) =>
          values.contact === null && options.length === 1 ? { contact: options[0] } : undefined,
      },
    },
  },
});

const modes = [
  { mode: "create", label: "Create" },
  { mode: "edit", label: "Edit" },
] satisfies { mode: Mode; label: string }[];

export const Demo = () => {
  const [mode, setMode] = useState<Mode>("create");
  // The mode comes from context and is fixed per session. Each mode gets its own key and session.
  const editor = useFormSession(visit, { key: mode, scope: "south-trading", context: { mode } });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <fieldset className="segmented">
        <legend>Mode</legend>
        {modes.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            onClick={() => setMode(option.mode)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      <Field session={session} name="customer" />
      <Field session={session} name="contact" />
      <SessionState session={session} show={["values", "queries"]} />
    </>
  );
};
