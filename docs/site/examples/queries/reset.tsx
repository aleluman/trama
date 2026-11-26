import type { FormValues } from "trama-forms/core";
import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const orderLine = defineForm({
  fields: {
    customer: field.select({
      label: "Customer",
      options: [
        { value: 1, label: "Atlas Trading" },
        { value: 2, label: "Prisma Trading" },
        { value: 3, label: "Compass Trading" },
      ],
    }),
    price: field.number({ label: "Unit price", default: 5000 }),
  },
  rules: {
    price: {
      query: {
        endpoint: "listPrice",
        params: ({ customer }) => (customer === null ? undefined : { customer }),
      },
    },
  },
});

const Order = ({
  heading,
  initial,
}: {
  heading: string;
  initial: Partial<FormValues<typeof orderLine>>;
}) => {
  const editor = useFormSession(orderLine, { scope: "south-trading", initial });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <fieldset>
      <legend>{heading}</legend>
      <div className="row">
        <Field session={session} name="customer" />
        <Field session={session} name="price" />
      </div>
      <button type="button" onClick={() => session.reset()}>
        Reset
      </button>
      <SessionState session={session} show={["queries"]} />
    </fieldset>
  );
};

// reset runs the queries again as on opening. It requests the price omitted from initial
// and keeps the price supplied in initial.
export const Demo = () => (
  <>
    <Order heading="New order fetches its price" initial={{ customer: 1 }} />
    <Order heading="Saved order opens with its price" initial={{ customer: 1, price: 900 }} />
  </>
);
