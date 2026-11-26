import { useState } from "react";
import { declareContext, defineForm, field, type FormValues } from "trama-forms/core";
import { Field, useFormSession } from "../../ui/form-ui";

type PickupContext = { today: string; warehouse: "north" | "south" };

const pickup = defineForm({
  context: declareContext<PickupContext>(),
  // Runs once when each session is created. It gives some fields values. The rest
  // start at their own default.
  defaults: ({ today, warehouse }) => ({ date: today, warehouse }),
  fields: {
    date: field.text({ label: "Pickup date", placeholder: "YYYY-MM-DD" }),
    warehouse: field.select({
      label: "Warehouse",
      options: [
        { value: "north", label: "North warehouse" },
        { value: "south", label: "South warehouse" },
      ],
      default: "north",
    }),
    slot: field.text({ label: "Time slot", default: "09:00–13:00" }),
    urgent: field.checkbox({ label: "Urgent pickup" }),
  },
  rules: {
    // toDefaults returns the value from defaults or falls back to the field's default.
    urgent: {
      onChange: ({ urgent }, { toDefaults }) =>
        urgent ? toDefaults("date", "warehouse", "slot") : undefined,
    },
  },
});

const Pickup = ({
  heading,
  context,
  initial,
}: {
  heading: string;
  context: PickupContext;
  initial?: Partial<FormValues<typeof pickup>>;
}) => {
  const editor = useFormSession(pickup, { initial, context });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <fieldset>
      <legend>{heading}</legend>
      <div className="row">
        <Field session={session} name="date" />
        <Field session={session} name="warehouse" />
        <Field session={session} name="slot" />
      </div>
      <Field session={session} name="urgent" />
      <button type="button" onClick={() => session.reset()}>
        Reset
      </button>
    </fieldset>
  );
};

// Today's date in the browser, as YYYY-MM-DD.
const localToday = () => new Date().toLocaleDateString("sv-SE");

export const Demo = () => {
  // Calculate today's date only when opening the session. A different context for
  // the same session throws an error.
  const [context] = useState<PickupContext>(() => ({ today: localToday(), warehouse: "south" }));
  return (
    <>
      <Pickup heading="New pickup (defaults from context)" context={context} />
      <Pickup
        heading="Saved pickup (initial takes precedence)"
        context={context}
        initial={{ date: "2027-03-15", slot: "14:00–18:00" }}
      />
    </>
  );
};
