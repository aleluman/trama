import { useState } from "react";
import { declareContext, defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

type Mode = "create" | "edit" | "view";

const customer = defineForm({
  // Context is declared only in types, using a type alias for plain data.
  context: declareContext<{ mode: Mode }>(),
  fields: {
    code: field.text({ label: "Code", readOnly: "Assigned by the system" }),
    name: field.text({ label: "Legal name" }),
    email: field.text({ label: "Billing email" }),
  },
  rules: {
    // A new customer has no code yet.
    code: { hidden: (_, { context }) => context.mode === "create" },
    // In create mode, the label changes. undefined restores the definition's label.
    name: {
      label: (_, { context }) =>
        context.mode === "create" ? "New customer's legal name" : undefined,
    },
  },
  // In view mode, the whole form is read-only and has a reason.
  form: { readOnly: { value: (_, { context }) => context.mode === "view" && "Read-only" } },
});

// The saved customer that edit and view modes open.
const saved = { code: "C-0042", name: "Atlas Trading", email: "billing@atlas.example" };

const modes = [
  { mode: "create", label: "Create" },
  { mode: "edit", label: "Edit" },
  { mode: "view", label: "View" },
] satisfies { mode: Mode; label: string }[];

export const Demo = () => {
  const [mode, setMode] = useState<Mode>("edit");
  // Context stays fixed for each session. Each mode has a different key and opens another
  // session. A new object on each render leaves the context unchanged if it has the same data.
  const editor = useFormSession(customer, {
    key: mode,
    initial: mode === "create" ? undefined : saved,
    context: { mode },
  });
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
      <Field session={session} name="code" />
      <Field session={session} name="name" />
      <Field session={session} name="email" />
      <SessionState session={session} show={["values", "fieldStates"]} />
    </>
  );
};
