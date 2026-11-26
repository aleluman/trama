import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const delivery = defineForm({
  fields: {
    // No rule withdraws state declared on the field.
    code: field.text({ label: "Order", default: "ORD-1042", readOnly: "Assigned by the system" }),
    includeNote: field.checkbox({ label: "Include note", default: true }),
    confirmed: field.checkbox({ label: "Order confirmed" }),
    note: field.text({ label: "Note for the delivery driver", default: "Leave at the front desk" }),
    floor: field.text({ label: "Floor or apartment" }),
  },
  rules: {
    // Two independent causes. Either one returning true or a reason is enough.
    note: {
      disabled: [
        ({ includeNote }) => !includeNote && "No note included",
        ({ confirmed }) => confirmed && "Order confirmed",
      ],
    },
    // The floor is hidden without a note and required with a note.
    floor: {
      hidden: ({ includeNote }) => !includeNote,
      required: ({ includeNote }) => includeNote,
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(delivery);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="code" />
      <Field session={session} name="includeNote" />
      <Field session={session} name="confirmed" />
      <Field session={session} name="note" />
      <Field session={session} name="floor" />
      <div className="actions">
        {/* State limits the view. The core accepts the write. */}
        <button type="button" onClick={() => session.edit("note", "Written from code")}>
          {'session.edit("note", …)'}
        </button>
      </div>
      <SessionState session={session} show={["values", "fieldStates"]} />
    </>
  );
};
