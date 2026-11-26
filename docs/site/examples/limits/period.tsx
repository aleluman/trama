import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// A report period. “To” cannot be earlier than “From”, and “From” cannot be later
// than “To”. The renderer passes the limits to the browser calendar.
const period = defineForm({
  fields: {
    from: field.date({ label: "From" }),
    to: field.date({ label: "To" }),
  },
  rules: {
    // Without the other date, the formula returns null. There is no limit and the key is omitted.
    from: { max: ({ to }) => to },
    to: { min: ({ from }) => from },
  },
});

export const Demo = () => {
  const editor = useFormSession(period);
  if (editor.status !== "ready") return null;
  const { session } = editor;
  return (
    <>
      <div className="row">
        <Field session={session} name="from" />
        <Field session={session} name="to" />
      </div>
      <SessionState
        session={session}
        show={["values", "fieldStates"]}
        properties={["min", "max"]}
      />
    </>
  );
};
