import { useState } from "react";
import type { Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";
import { initial, order } from "./order";

// Context is set when the session opens. Sending the order changes the session key
// and opens a new session with the same initial values and a different context.
export const Demo = () => {
  const [sent, setSent] = useState(false);
  const editor = useFormSession(order, {
    key: sent ? "sent" : "draft",
    context: { sent },
    initial,
  });
  if (editor.status !== "ready") return null;
  const { session } = editor;
  return (
    <>
      <div className="row">
        <Field session={session} name="branch" />
        <Field session={session} name="depot" />
        <Field session={session} name="rate" />
        <Field session={session} name="total" />
      </div>
      <Field session={session} name="notes" />
      <Lines session={session} />
      <div className="actions">
        <button type="button" onClick={() => session.add("lines", [{ product: "p3" }])}>
          Add line
        </button>
        <button
          type="button"
          onClick={() => session.remove("lines", session.getSnapshot().rows.lines)}
        >
          Remove all
        </button>
        <button type="button" onClick={() => setSent(!sent)}>
          {sent ? "Return to draft" : "Send order"}
        </button>
      </div>
      <SessionState session={session} show={["values"]} />
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
            <th scope="col">Quantity</th>
            <th scope="col">Price</th>
            <th scope="col">Amount</th>
            <th scope="col">Lot</th>
            <th scope="col">Warehouse</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key, index) => {
            const line = session.row("lines", key);
            return (
              <tr key={key}>
                <th scope="row">{index + 1}</th>
                <td>
                  <Field row={line} name="quantity" />
                </td>
                <td>
                  <Field row={line} name="price" />
                </td>
                <td>
                  <Field row={line} name="amount" />
                </td>
                <td>
                  <Field row={line} name="lot" />
                </td>
                <td>
                  <Field row={line} name="warehouse" />
                </td>
                <td>
                  <Field row={line} name="notes" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
