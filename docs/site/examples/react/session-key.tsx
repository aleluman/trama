import { useState } from "react";
import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const contact = defineForm({
  fields: {
    name: field.text({ label: "Name" }),
    email: field.text({ label: "Email" }),
  },
});

const saved = {
  1: { name: "Ana Pérez", email: "ana@example.com" },
  2: { name: "Luis Soto", email: "luis@example.com" },
};

export const Demo = () => {
  const [id, setId] = useState<1 | 2>(1);
  // key identifies the session. Changing it opens a new session with its own initial values.
  const editor = useFormSession(contact, { key: id, initial: saved[id] });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="actions">
        <button type="button" aria-pressed={id === 1} onClick={() => setId(1)}>
          Contact 1
        </button>
        <button type="button" aria-pressed={id === 2} onClick={() => setId(2)}>
          Contact 2
        </button>
      </div>
      <Field session={session} name="name" />
      <Field session={session} name="email" />
      <SessionState session={session} />
    </>
  );
};
