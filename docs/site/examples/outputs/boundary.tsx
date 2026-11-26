import { defineForm, field, type Session } from "trama-forms/core";
import { OutputBoundary, useOutputs } from "trama-forms/react";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const bill = defineForm({
  fields: {
    amount: field.number({ label: "Bill", default: 36000 }),
    people: field.number({ label: "People", default: 3 }),
  },
  outputs: ({ output }) => ({
    perPerson: output((values) => {
      if (values.people === null || values.people <= 0)
        throw new Error("At least one person is required");
      return Math.round((values.amount ?? 0) / values.people);
    }),
    caption: output(({ amount }) => `Total bill: $${amount ?? 0}`),
  }),
});

type Props = { session: Session<typeof bill> };

// Reading a failed output throws. OutputBoundary displays the fallback.
const PerPerson = ({ session }: Props) => {
  const { perPerson } = useOutputs(session);
  return (
    <p>
      Each person pays <strong>${perPerson}</strong>
    </p>
  );
};

const Caption = ({ session }: Props) => {
  const { caption } = useOutputs(session);
  return <p>{caption}</p>;
};

export const Demo = () => {
  const editor = useFormSession(bill);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <div className="row">
        <Field session={session} name="amount" />
        <Field session={session} name="people" />
      </div>
      <div className="card">
        <Caption session={session} />
        <OutputBoundary
          session={session}
          fallback={
            <p className="error">Cannot split the bill. Enter how many people are paying.</p>
          }
        >
          <PerPerson session={session} />
        </OutputBoundary>
      </div>
      <SessionState session={session} show={["outputs"]} />
    </>
  );
};
