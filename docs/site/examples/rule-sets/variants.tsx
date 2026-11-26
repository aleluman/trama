import { useState } from "react";
import { useFormSession } from "../../ui/form-ui";
import { Document } from "./document";
import { initial, order, quote } from "./forms";

// The order and quote share the same saved line. Only the quote includes discounted
// amounts, and only the order includes the lock for sent orders.
export const Demo = () => {
  const [sent, setSent] = useState(false);
  // Context is fixed per session. Sending opens another session with sent set to true.
  const ordered = useFormSession(order, {
    key: String(sent),
    scope: "inventory",
    initial,
    context: { sent },
  });
  const quoted = useFormSession(quote, { scope: "inventory", initial });
  return (
    <>
      <fieldset>
        <legend>Order{sent ? " sent" : ""}</legend>
        {ordered.status === "ready" && <Document session={ordered.session} />}
        <button type="button" onClick={() => setSent(!sent)}>
          {sent ? "Return to draft" : "Send"}
        </button>
      </fieldset>
      <fieldset>
        <legend>Quote</legend>
        {quoted.status === "ready" && <Document session={quoted.session} />}
      </fieldset>
    </>
  );
};
