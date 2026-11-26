import { useState } from "react";
import type { Issue, RowHandleOf, Session } from "trama-forms/core";
import { createReactBinding, useRows } from "trama-forms/react";
import { located } from "../../lib/format";
import { defineForm, field } from "../../forms.ts";
import { PartialDate } from "../../ui/partial-date";

// A trip with its departure date and stops. Dates are entered as text. The renderer
// keeps the draft and reports it while it is incomplete.
const trip = defineForm({
  fields: { since: field.date({ label: "Departure", required: "Choose the departure date" }) },
  collections: { stops: { fields: { day: field.date({ label: "Day" }) } } },
});
const typed = createReactBinding({ date: PartialDate });

export const Demo = () => {
  const editor = typed.useFormSession(trip, { initial: { stops: [{}] } });
  if (editor.status !== "ready") return null;
  return <Trip session={editor.session} />;
};

type Outcome = "idle" | "ready" | readonly Issue[];

const Trip = ({ session }: { session: Session<typeof trip> }) => {
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const keys = useRows(session, "stops");
  const prepare = async () => {
    const result = await session.prepare();
    if (result.status !== "cancelled")
      setOutcome(result.status === "ready" ? "ready" : result.issues);
  };
  return (
    <>
      {/* Two views of the same field. Each keeps its own text and reports its input. */}
      <div className="row">
        <section aria-label="List">
          <h4>List</h4>
          <typed.Field session={session} name="since" />
        </section>
        <section aria-label="Detail">
          <h4>Detail</h4>
          <typed.Field session={session} name="since" />
        </section>
      </div>
      {keys.map((key) => (
        <Stop key={key} row={session.row("stops", key)} />
      ))}
      <div className="actions">
        <button type="button" onClick={() => void prepare()}>
          Prepare
        </button>
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
      <Summary session={session} outcome={outcome} />
    </>
  );
};

// A stop with its row state.
const Stop = ({ row }: { row: RowHandleOf<typeof trip, "stops"> }) => {
  const state = typed.useFormState(row);
  return (
    <div className="row">
      <typed.Field row={row} name="day" />
      <p className="hint">{state?.touched === true ? "Stop touched" : "Stop untouched"}</p>
    </div>
  );
};

const Summary = ({ session, outcome }: { session: Session<typeof trip>; outcome: Outcome }) => {
  const form = typed.useFormState(session);
  const stops = typed.useFormState(session, "stops");
  return (
    <div className="state-panel" aria-label="Trip status">
      <strong>{form.inputPending ? "Pending input" : "No pending input"}</strong>
      <p>
        {form.dirty ? "Changes made" : "No changes"} · {form.errorCount}{" "}
        {form.errorCount === 1 ? "error" : "errors"}, {stops.errorCount} in stops
      </p>
      {outcome === "ready" && <p>Ready to submit</p>}
      {typeof outcome !== "string" && (
        <ol aria-label="Not submitted">
          {outcome.map((issue) => (
            <li key={located(issue)}>{located(issue)}</li>
          ))}
        </ol>
      )}
    </div>
  );
};
