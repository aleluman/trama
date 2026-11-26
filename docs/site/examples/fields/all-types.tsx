import { defineForm, field, type FormValues } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const profile = defineForm({
  fields: {
    name: field.text({ label: "Name", placeholder: "E.g., Ana Pérez" }),
    age: field.number({ label: "Age", placeholder: "Years" }),
    active: field.checkbox({ label: "Active account", default: true }),
    plan: field.select({
      label: "Plan",
      options: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
      ],
      default: "free",
    }),
    seats: field.select({
      label: "Seats",
      options: [
        { value: 1, label: "1 seat" },
        { value: 5, label: "5 seats" },
      ],
    }),
  },
});

// The definition determines the inferred type of the values.
// { name: string; age: number | null; active: boolean;
//   plan: "free" | "pro" | null; seats: 1 | 5 | null }
export type ProfileValues = FormValues<typeof profile>;

export const Demo = () => {
  const editor = useFormSession(profile);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="name" />
      <Field session={session} name="age" />
      <Field session={session} name="active" />
      <Field session={session} name="plan" />
      <Field session={session} name="seats" />
      <SessionState session={session} />
    </>
  );
};
