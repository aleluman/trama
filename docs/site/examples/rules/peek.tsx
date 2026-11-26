import { defineForm, field } from "trama-forms/core";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// List prices in US dollars.
const listPrices = { basic: 10, pro: 25 };

const line = defineForm({
  fields: {
    product: field.select({
      label: "Product",
      options: [
        { value: "basic", label: "Basic (USD 10)" },
        { value: "pro", label: "Pro (USD 25)" },
      ],
      default: "basic",
    }),
    rate: field.number({ label: "Exchange rate (JPY per USD)", default: 150 }),
    price: field.number({ label: "Price (JPY)" }),
  },
  rules: {
    price: {
      // product is a dependency, so changing it recalculates the price.
      // peek reads rate without creating a dependency, so changing rate leaves the price as it is.
      value: ({ product }, { peek }) =>
        product === null ? null : listPrices[product] * (peek.rate ?? 0),
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(line);
  if (editor.status !== "ready") return null;
  const { session } = editor;

  return (
    <>
      <Field session={session} name="product" />
      <Field session={session} name="rate" />
      <Field session={session} name="price" />
      <SessionState session={session} />
    </>
  );
};
