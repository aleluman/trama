import { useState } from "react";
import { defineForm, field } from "trama-forms/core";
import { messageOf } from "../../lib/format";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const payment = defineForm({
  fields: {
    amount: field.number({ label: "Amount", default: 120 }),
    installments: field.number({ label: "Installments", default: 1 }),
    perInstallment: field.number({ label: "Amount per installment" }),
  },
  rules: {
    perInstallment: {
      value: ({ amount, installments }) => {
        if (installments === null || installments <= 0)
          throw new Error("The number of installments must be greater than zero");
        return (amount ?? 0) / installments;
      },
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(payment);
  const [failure, setFailure] = useState<string>();
  if (editor.status !== "ready") return null;
  const { session } = editor;

  // If a formula fails, edit throws and the session keeps the previous snapshot.
  const setInstallments = (value: number) => {
    try {
      session.edit("installments", value);
      setFailure(undefined);
    } catch (error) {
      setFailure(messageOf(error));
    }
  };

  return (
    <>
      <Field session={session} name="amount" />
      <div className="actions">
        {[1, 3, 0].map((value) => (
          <button key={value} type="button" onClick={() => setInstallments(value)}>
            {`edit("installments", ${value})`}
          </button>
        ))}
      </div>
      {failure !== undefined && (
        <p role="alert" className="error">
          {failure}
        </p>
      )}
      <Field session={session} name="perInstallment" />
      <SessionState session={session} />
    </>
  );
};
