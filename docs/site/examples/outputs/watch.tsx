import { useEffect, useState } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { format } from "../../lib/format";
import { Field } from "../../ui/form-ui";

const shipping = defineForm({
  fields: {
    weight: field.number({ label: "Weight (kg)", default: 2 }),
    express: field.checkbox({ label: "Express shipping" }),
    reference: field.text({ label: "Reference (no output reads it)" }),
  },
  outputs: ({ output }) => ({
    // Returns a new object on each calculation.
    rate: output(({ weight, express }) => ({
      band: (weight ?? 0) <= 5 ? "light" : "heavy",
      express,
    })),
  }),
});

export const Demo = () => {
  // watchOutputs is part of the core and also works outside React.
  const [session] = useState(() => createSession(shipping));
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    const received: string[] = [];
    // Runs immediately and again only when the content it read changes.
    return session.watchOutputs(({ rate }) => {
      received.push(`rate = ${format(rate)} · frozen: ${String(Object.isFrozen(rate))}`);
      setNotices([...received]);
    });
  }, [session]);

  return (
    <>
      <Field session={session} name="weight" />
      <Field session={session} name="express" />
      <Field session={session} name="reference" />
      <p className="state-title">watchOutputs notifications</p>
      <ol className="log">
        {notices.map((notice, index) => (
          // oxlint-disable-next-line no-array-index-key -- The log only grows.
          <li key={index}>
            <code>{notice}</code>
          </li>
        ))}
      </ol>
    </>
  );
};
