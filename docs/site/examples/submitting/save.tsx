import { useState } from "react";
import type { Issue, Prepared, RowHandleOf, Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { located } from "../../lib/format";
import { Field, useFormSession, useFormState } from "../../ui/form-ui";
import { saveVoucher, type Rejection } from "./server.ts";
import { toPayload, voucher } from "./voucher.ts";

type Status =
  | { readonly kind: "idle" | "preparing" | "sending" | "cancelled" | "late" | "rejected" }
  | { readonly kind: "invalid"; readonly issues: readonly Issue[] }
  | { readonly kind: "saved"; readonly number: number };

export const Demo = () => {
  const editor = useFormSession(voucher, {
    scope: "south-trading",
    initial: { lines: [{ quantity: 1 }] },
  });
  if (editor.status !== "ready") return null;
  return <Voucher session={editor.session} />;
};

// To save, prepare and send the submission, then commit or place server errors based on the response.
const save = async (session: Session<typeof voucher>, setStatus: (status: Status) => void) => {
  // The application tracks the submission in progress and marks it before preparing.
  setStatus({ kind: "preparing" });
  const sent = await session.prepare();
  if (sent.status === "cancelled") return setStatus({ kind: "cancelled" });
  if (sent.status === "invalid") return setStatus({ kind: "invalid", issues: sent.issues });
  setStatus({ kind: "sending" });
  const reply = await saveVoucher(toPayload(sent.values));
  if (!reply.ok) {
    // With from, targets that changed after preparation receive no error.
    const placed = session.setErrors("server", issuesOf(reply, sent), { from: sent });
    return setStatus({ kind: placed ? "rejected" : "late" });
  }
  // Use the row key at preparation to apply each line’s canonical values.
  const lines = Object.fromEntries(
    sent.rows.lines.map((key, index) => [key, { id: reply.ids[index] }]),
  );
  if (!session.commit(sent, { number: reply.number, lines })) return setStatus({ kind: "late" });
  // Saving replaces the server’s previous messages with no errors and the new warnings.
  session.setErrors("server", []);
  const warnings = reply.warnings.map(({ line, message }) => ({
    collection: "lines" as const,
    key: sent.rows.lines[line],
    message,
  }));
  session.setWarnings("server", warnings, { from: sent });
  return setStatus({ kind: "saved", number: reply.number });
};

const Voucher = ({ session }: { session: Session<typeof voucher> }) => {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "preparing" || status.kind === "sending";
  return (
    <>
      <div className="row">
        <Field session={session} name="number" />
        <Field session={session} name="customer" />
        <Field session={session} name="price" />
      </div>
      <Lines session={session} />
      <div className="actions">
        <button type="button" onClick={() => session.add("lines", [{ quantity: 1 }])}>
          Add line
        </button>
        <button type="button" disabled={busy} onClick={() => void save(session, setStatus)}>
          Save
        </button>
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
      <Sending session={session} status={status} />
    </>
  );
};

// The application maps the rejection to issues, locating each line by its key at
// preparation regardless of its current position.
const issuesOf = (reply: Rejection, sent: Prepared<typeof voucher>): Issue<typeof voucher>[] => [
  ...reply.general.map((message) => ({ message })),
  ...reply.params.map(({ name, message }) => ({ field: name, message })),
  ...reply.lines.map(({ line, column, message }) => ({
    collection: "lines" as const,
    key: sent.rows.lines[line],
    field: column,
    message,
  })),
];

const columns = ["id", "quantity", "amount"] as const;
const Lines = ({ session }: { session: Session<typeof voucher> }) => {
  const keys = useRows(session, "lines");
  return (
    <div className="table-scroll lines-table">
      <table>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Quantity</th>
            <th scope="col">Amount</th>
            <th scope="col">Warnings</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <Line key={key} row={session.row("lines", key)} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

// A line with the row’s own warnings, which the server returns on save.
const Line = ({ row }: { row: RowHandleOf<typeof voucher, "lines"> }) => {
  const state = useFormState(row);
  return (
    <tr>
      {columns.map((name) => (
        <td key={name}>
          <Field row={row} name={name} />
        </td>
      ))}
      <td>{state?.warnings.join(" · ")}</td>
    </tr>
  );
};

// Shows the submission status tracked by the application, whether the form differs from
// the saved values, and form-level errors, including server errors with no field target.
const Sending = ({ session, status }: { session: Session<typeof voucher>; status: Status }) => {
  const form = useFormState(session);
  return (
    <div className="state-panel" aria-label="Submission status">
      <strong>{describe(status)}</strong>
      <p>{form.dirty ? "Changes made" : "No changes"}</p>
      {form.errors.map((message) => (
        <p key={message} role="alert">
          {message}
        </p>
      ))}
      {status.kind === "invalid" && (
        <ol>
          {status.issues.map((issue) => (
            <li key={located(issue)}>{located(issue)}</li>
          ))}
        </ol>
      )}
    </div>
  );
};

const describe = (status: Status) => {
  switch (status.kind) {
    case "idle":
      return "Not submitted";
    case "preparing":
      return "Preparing…";
    case "sending":
      return "Sending to the simulated server…";
    case "cancelled":
      return "Canceled because you made a change during preparation";
    case "late":
      return "The response arrived after a reset";
    case "rejected":
      return "The server rejected the voucher";
    case "invalid":
      return "Submission blocked by errors";
    case "saved":
      return `Saved as No. ${status.number}`;
  }
};
