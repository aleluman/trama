import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const contact = defineForm({
  fields: {
    name: field.text({ label: "Name" }),
    age: field.number({ label: "Age" }),
    newsletter: field.checkbox({ label: "Receive updates", default: true }),
  },
});

export const Demo = () => {
  // With synchronous initial values, the session is ready on the first render.
  const editor = useFormSession(contact, { initial: { name: "Ana" } });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="name" />
      <Field session={session} name="age" placeholder="Years" />
      <Field session={session} name="newsletter" />
      <div className="actions">
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
      <SessionState session={session} />
    </>
  );
};
