import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const discount = defineForm({
  fields: {
    gross: field.number({ label: "Gross amount", default: 1000 }),
    percent: field.number({ label: "Percentage", default: 0 }),
    amount: field.number({ label: "Discount amount" }),
    discountBy: field.select({
      label: "Discount by",
      options: [
        { value: "percent", label: "Percentage" },
        { value: "amount", label: "Amount" },
      ],
    }),
  },
  rules: {
    discountBy: {
      relation: {
        // With “No selection”, the percentage drives.
        default: "percent",
        members: {
          percent: ({ gross, amount }) =>
            gross === null || gross === 0 ? undefined : ((amount ?? 0) / gross) * 100,
          amount: ({ gross, percent }) => Math.round(((gross ?? 0) * (percent ?? 0)) / 100),
        },
      },
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(discount);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="gross" />
      <div className="row">
        <Field session={session} name="percent" />
        <Field session={session} name="amount" />
      </div>
      <Field session={session} name="discountBy" />
      <SessionState session={session} />
    </>
  );
};
