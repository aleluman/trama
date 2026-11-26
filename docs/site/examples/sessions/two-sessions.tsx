import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const note = defineForm({
  fields: {
    title: field.text({ label: "Title" }),
    pinned: field.checkbox({ label: "Pinned" }),
  },
});

// Each call to useFormSession opens its own session of the same definition.
const NoteEditor = ({ heading, initial }: { heading: string; initial?: { title: string } }) => {
  const editor = useFormSession(note, { initial });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <fieldset>
      <legend>{heading}</legend>
      <Field session={session} name="title" />
      <Field session={session} name="pinned" />
      <button type="button" onClick={() => session.reset()}>
        Reset
      </button>
      <SessionState session={session} />
    </fieldset>
  );
};

export const Demo = () => (
  <div className="columns">
    <NoteEditor heading="Session A (new)" />
    <NoteEditor heading="Session B (saved)" initial={{ title: "Buy bread" }} />
  </div>
);
