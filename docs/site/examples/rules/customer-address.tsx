import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const customers = { atlas: "24 Olive Street", horizon: "80 Central Avenue" };

const invoice = defineForm({
  fields: {
    customer: field.select({
      label: "Customer",
      options: [
        { value: "atlas", label: "Atlas Trading" },
        { value: "horizon", label: "Horizon Distribution" },
      ],
    }),
    address: field.text({ label: "Address" }),
  },
  rules: {
    customer: {
      onEdit: ({ customer }, { before }) =>
        before.address === "" && customer !== null ? { address: customers[customer] } : undefined,
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(invoice);
  if (editor.status !== "ready") return null;
  const { session } = editor;
  const restore = () => {
    session.reset();
    session.patch({ customer: "atlas", address: "42 New Street" });
  };

  return (
    <>
      <Field session={session} name="customer" />
      <Field session={session} name="address" />
      <button type="button" onClick={restore}>
        Restore
      </button>
      <SessionState session={session} />
    </>
  );
};
