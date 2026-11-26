import { defineForm, field, type FormInitial, type Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";

// An order in yen or dollars. The price decimals come from the header currency, and
// “No cap” removes the maximum discount for its line.
const order = defineForm({
  fields: {
    currency: field.select({
      label: "Currency",
      options: [
        { value: "JPY", label: "Yen" },
        { value: "USD", label: "Dollars" },
      ],
      default: "JPY",
    }),
  },
  collections: {
    lines: {
      fields: {
        price: field.number({ label: "Price" }),
        quantity: field.number({ label: "Quantity", min: 0, default: 1 }),
        free: field.checkbox({ label: "No cap" }),
        discount: field.number({ label: "Discount %", min: 0, max: 100, default: 0 }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        // One formula per property, as with label. The row rule reads the header in values.
        price: { decimals: (_, { values }) => (values.currency === "USD" ? 2 : 0) },
        // null removes the definition's maximum. undefined withdraws the contribution and restores 100.
        discount: { max: ({ free }) => (free ? null : undefined) },
      },
    },
  },
});

// A price with three decimals. Trama keeps its full precision.
const initial: FormInitial<typeof order> = {
  lines: [{ price: 123.456, quantity: 2 }, { price: 80 }],
};

export const Demo = () => {
  const editor = useFormSession(order, { initial });
  if (editor.status !== "ready") return null;
  const { session } = editor;
  return (
    <>
      <Field session={session} name="currency" />
      <Lines session={session} />
      <SessionState
        session={session}
        show={["values", "fieldStates"]}
        properties={["decimals", "min", "max", "errors"]}
      />
    </>
  );
};

const Lines = ({ session }: { session: Session<typeof order> }) => {
  const keys = useRows(session, "lines");
  return (
    <div className="table-scroll lines-table">
      <table>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Price</th>
            <th scope="col">Quantity</th>
            <th scope="col">No cap</th>
            <th scope="col">Discount %</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key, index) => {
            const line = session.row("lines", key);
            return (
              <tr key={key}>
                <th scope="row">{index + 1}</th>
                <td>
                  <Field row={line} name="price" />
                </td>
                <td>
                  <Field row={line} name="quantity" />
                </td>
                <td>
                  <Field row={line} name="free" />
                </td>
                <td>
                  <Field row={line} name="discount" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
