import type { Session } from "trama-forms/core";
import { defineForm, field } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const descriptions = { screw: "6 mm screw", nut: "6 mm nut" };

const order = defineForm({
  fields: {},
  collections: {
    lines: {
      fields: {
        product: field.select({
          label: "Product",
          options: [
            { value: "screw", label: "Screw" },
            { value: "nut", label: "Nut" },
          ],
        }),
        description: field.text({ label: "Description" }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        // In a row, before.row is the row at the start of the operation.
        product: {
          onEdit: ({ product }, { before }) =>
            before.row.description === "" && product !== null
              ? { description: descriptions[product] }
              : undefined,
        },
      },
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(order, {
    initial: { lines: [{}, { description: "Entered by hand" }] },
  });
  if (editor.status !== "ready") return null;
  return <Lines session={editor.session} />;
};

const Lines = ({ session }: { session: Session<typeof order> }) => {
  const keys = useRows(session, "lines");

  return (
    <>
      {keys.map((key) => {
        const line = session.row("lines", key);
        return (
          <div key={key}>
            <Field row={line} name="product" />
            <Field row={line} name="description" />
          </div>
        );
      })}
      <SessionState session={session} />
    </>
  );
};
