import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

const delivery = defineForm({
  fields: {
    method: field.select({
      label: "Delivery",
      options: [
        { value: "shipping", label: "Shipping" },
        { value: "pickup", label: "Store pickup" },
      ],
      default: "shipping",
    }),
    address: field.text({ label: "Address" }),
    city: field.text({ label: "City" }),
    store: field.select({
      label: "Store",
      options: [
        { value: "downtown", label: "Downtown" },
        { value: "north", label: "North" },
      ],
    }),
  },
  rules: {
    // One calculation decides the state of several fields. Each evaluation replaces
    // the whole patch and withdraws contributions it leaves out.
    method: {
      states: ({ method }) =>
        method === "pickup"
          ? { address: { hidden: true }, city: { hidden: true }, store: { required: true } }
          : { store: { hidden: true }, address: { required: true }, city: { required: true } },
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(delivery);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="method" />
      <Field session={session} name="address" />
      <Field session={session} name="city" />
      <Field session={session} name="store" />
      <SessionState session={session} show={["values", "fieldStates"]} />
    </>
  );
};
