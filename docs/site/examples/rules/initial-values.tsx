import { defineForm, field, type FormValues } from "trama-forms/core";
import { Field, useFormSession } from "../../ui/form-ui";

const line = defineForm({
  fields: {
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Price", default: 10 }),
    total: field.number({ label: "Total" }),
  },
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
  },
});

const Line = ({
  heading,
  initial,
}: {
  heading: string;
  initial: Partial<FormValues<typeof line>>;
}) => {
  const editor = useFormSession(line, { initial });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <fieldset>
      <legend>{heading}</legend>
      <div className="row">
        <Field session={session} name="quantity" />
        <Field session={session} name="price" />
        <Field session={session} name="total" />
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
    </fieldset>
  );
};

export const Demo = () => (
  <>
    <Line heading="No initial values. The formula calculates 2 × 10" initial={{}} />
    <Line heading="initial: { total: 17 } is kept" initial={{ total: 17 }} />
    <Line heading="initial: { quantity: 3 } and total is calculated" initial={{ quantity: 3 }} />
  </>
);
