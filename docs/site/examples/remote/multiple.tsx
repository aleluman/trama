import { defineForm, field } from "../../forms.ts";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// The filters for a sales report are the catalog's families and subfamilies.
// Both store complete options.
const salesReport = defineForm({
  fields: {
    families: field.multiAsync("families", { label: "Families", placeholder: "All" }),
    subfamilies: field.multiAsync("subfamilies", { label: "Subfamilies", placeholder: "All" }),
  },
  rules: {
    // Without families, the event clears the subfamilies. Another nonempty set leaves
    // them intact because an event cannot read the field it writes.
    families: {
      onChange: ({ families }) => (families.length === 0 ? { subfamilies: [] } : undefined),
    },
    // subfamilies receives the family IDs. Without families, its list is suspended.
    subfamilies: {
      params: ({ families }) =>
        families.length === 0 ? undefined : { families: families.map((family) => family.value) },
      disabled: ({ families }) => families.length === 0 && "Choose a family first",
    },
  },
  // The request to the server carries only the IDs. For Trama, [] does not mean "all".
  // The report server decides that.
  outputs: ({ output }) => ({
    request: output(({ families, subfamilies }) => ({
      families: families.map((family) => family.value),
      subfamilies: subfamilies.map((subfamily) => subfamily.value),
    })),
  }),
});

export const Demo = () => {
  const editor = useFormSession(salesReport, { scope: "south-trading" });
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="families" />
      <Field session={session} name="subfamilies" />
      <SessionState session={session} show={["values", "outputs"]} />
    </>
  );
};
