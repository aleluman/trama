import type { FormDefinition, QueryState, Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { Field } from "../../ui/form-ui";
import { sale } from "./fields";

// A document in the family, with a header and a line table. It serves the order,
// the quote, and each variant because they share the same shape.
export type Sale = FormDefinition<
  typeof sale.fields,
  Record<string, unknown>,
  unknown,
  Record<string, QueryState>,
  typeof sale.collections
>;
const columns = ["product", "warehouse", "lot", "quantity", "price", "discount", "amount"] as const;

export const Document = ({ session }: { session: Session<Sale> }) => {
  const keys = useRows(session, "lines");
  return (
    <>
      <div className="columns">
        <Field session={session} name="priceList" />
        <Field session={session} name="notes" />
        <Field session={session} name="total" />
      </div>
      <div className="table-scroll lines-table">
        <table>
          <thead>
            <tr>
              {["Product", "Warehouse", "Lot", "Quantity", "Price", "Disc. %", "Amount"].map(
                (title) => (
                  <th key={title} scope="col">
                    {title}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                {columns.map((name) => (
                  <td key={name}>
                    <Field row={session.row("lines", key)} name={name} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" onClick={() => session.add("lines", [{}])}>
          Add line
        </button>
      </div>
    </>
  );
};
