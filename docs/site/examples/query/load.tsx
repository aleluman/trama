import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { defineForm, field } from "trama-forms/core";
import { initialFromQuery } from "trama-forms/react";
import { messageOf } from "../../lib/format";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";
import { failNextRequest, fetchCustomer } from "./api";

const customer = defineForm({
  fields: {
    name: field.text({ label: "Legal name" }),
    tier: field.select({
      label: "Tier",
      options: [
        { value: "basic", label: "Basic" },
        { value: "gold", label: "Gold" },
      ],
    }),
    credit: field.number({ label: "Line of credit" }),
  },
});

export const Demo = () => {
  const [id, setId] = useState("c1");
  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: ({ signal }) => fetchCustomer(id, signal),
  });
  // The session opens when the data arrives. key discards the session when the customer changes.
  const editor = useFormSession(customer, { key: id, initial: initialFromQuery(query) });

  return (
    <>
      <div className="actions">
        <button type="button" aria-pressed={id === "c1"} onClick={() => setId("c1")}>
          Customer c1
        </button>
        <button type="button" aria-pressed={id === "c2"} onClick={() => setId("c2")}>
          Customer c2
        </button>
        <button type="button" className="quiet" onClick={failNextRequest}>
          Fail the next request
        </button>
      </div>

      {editor.status === "loading" && <output className="status">Loading customer…</output>}

      {editor.status === "error" && (
        <div role="alert" className="error">
          <p>Could not open: {messageOf(editor.error)}</p>
          <button type="button" onClick={editor.retry}>
            Retry
          </button>
        </div>
      )}

      {editor.status === "ready" && (
        <>
          <Field session={editor.session} name="name" />
          <Field session={editor.session} name="tier" />
          <Field session={editor.session} name="credit" />
          <div className="actions">
            <button type="button" onClick={() => editor.session.reset()}>
              Reset
            </button>
          </div>
          <SessionState session={editor.session} />
        </>
      )}
    </>
  );
};
