import { useState } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "trama-forms/core";
import { initialFromQuery, OutputBoundary, useOutputs } from "trama-forms/react";
import { messageOf } from "../../lib/format";
import { SessionState } from "../../lib/SessionState";
import { Field, useFormSession } from "../../ui/form-ui";
import { failNextRequest, fetchOrder, toOrderValues } from "./api.ts";
import { order, type OrderContext } from "./order.ts";

type Props = { session: Session<typeof order> };
type Mode = OrderContext["mode"];
// The company's scope separates remote data and is part of the cache key. Its currency
// reaches the totals through the context.
const company = { scope: "south-trading", currency: { code: "JPY", taxRate: 0.2 } };
const money = (amount: number) => `${amount} ${company.currency.code}`;
// Today's date in the browser, as YYYY-MM-DD.
const localToday = () => new Date().toLocaleDateString("sv-SE");

// The open order, with the mode and today's date from its context.
type Opened = { readonly id: string | undefined; readonly mode: Mode; readonly today: string };
// Context stays fixed per session, so changing the mode opens another session.
const keyOf = ({ id, mode }: Opened) => `${id ?? "new"}:${mode}`;

export const Demo = () => {
  const [opened, setOpened] = useState<Opened>(() => ({
    id: undefined,
    mode: "create",
    today: localToday(),
  }));
  // Opening an order calculates its context. Reopening the same order in the same mode keeps its session.
  const open = (id: string | undefined, mode: Mode) => {
    const next: Opened = { id, mode: id === undefined ? "create" : mode, today: localToday() };
    if (keyOf(next) !== keyOf(opened)) setOpened(next);
  };
  const { id, mode, today } = opened;
  const query = useQuery({
    queryKey: ["order", id],
    queryFn: id === undefined ? skipToken : ({ signal }) => fetchOrder(id, signal),
    select: toOrderValues,
    // Cached data stays fresh for 30 s, and the order opens without waiting.
    staleTime: 30_000,
  });
  const editor = useFormSession(order, {
    key: keyOf(opened),
    initial: id === undefined ? undefined : initialFromQuery(query),
    scope: company.scope,
    context: { mode, today, currency: company.currency },
  });

  return (
    <>
      <OrderPicker opened={opened} onOpen={open} />
      <p className="muted">
        Session context. Mode <code>{mode}</code>, today <code>{today}</code>, currency{" "}
        <code>{company.currency.code}</code>.
      </p>
      {editor.status === "loading" && <output className="status">Loading order {id}…</output>}
      {editor.status === "error" && (
        <div role="alert" className="error">
          <p>Could not open the order. {messageOf(editor.error)}</p>
          <button type="button" onClick={editor.retry}>
            Retry
          </button>
        </div>
      )}
      {editor.status === "ready" && <OrderForm session={editor.session} />}
    </>
  );
};

const modes = [
  { mode: "edit", label: "Edit" },
  { mode: "view", label: "View" },
] satisfies { mode: Mode; label: string }[];

const OrderPicker = ({
  opened,
  onOpen,
}: {
  opened: Opened;
  onOpen: (id: string | undefined, mode: Mode) => void;
}) => {
  // This mode applies to saved orders. A new order always opens in create mode.
  const [savedMode, setSavedMode] = useState<Mode>("edit");
  const client = useQueryClient();
  const failNextLoad = () => {
    failNextRequest();
    // Without cached data, the next order you open makes a request and fails.
    client.removeQueries({ queryKey: ["order"], type: "inactive" });
  };
  const chooseMode = (mode: Mode) => {
    setSavedMode(mode);
    if (opened.id !== undefined) onOpen(opened.id, mode);
  };
  return (
    <div className="actions">
      {[undefined, "1001", "1002"].map((option) => (
        <button
          key={option ?? "new"}
          type="button"
          aria-pressed={opened.id === option}
          onClick={() => onOpen(option, savedMode)}
        >
          {option === undefined ? "New order" : `Order ${option}`}
        </button>
      ))}
      <button type="button" className="quiet" onClick={failNextLoad}>
        Fail the next load
      </button>
      <ModePicker mode={savedMode} onChoose={chooseMode} />
    </div>
  );
};

const ModePicker = ({ mode, onChoose }: { mode: Mode; onChoose: (mode: Mode) => void }) => (
  <fieldset className="segmented">
    <legend>Saved order mode</legend>
    {modes.map((option) => (
      <button
        key={option.mode}
        type="button"
        aria-pressed={mode === option.mode}
        onClick={() => onChoose(option.mode)}
      >
        {option.label}
      </button>
    ))}
  </fieldset>
);

const OrderForm = ({ session }: Props) => (
  <div className="order">
    <div>
      <div className="row">
        <Field session={session} name="customer" />
        <Field session={session} name="contact" />
      </div>
      <div className="row">
        <Field session={session} name="quantity" />
        <Field session={session} name="price" />
        <Field session={session} name="total" />
      </div>
      <div className="row">
        <Field session={session} name="delivery" />
        <Field session={session} name="deliveryDate" />
      </div>
      <div className="row">
        <Field session={session} name="country" />
        <Field session={session} name="city" />
      </div>
      <Field session={session} name="useCapital" />
      <Field session={session} name="includeNote" />
      <Field session={session} name="confirmed" />
      <Field session={session} name="note" />
      <div className="actions">
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
    </div>

    <Summary session={session} />

    <details className="order-state">
      <summary>Session state</summary>
      <SessionState session={session} show={["values", "fieldStates", "queries", "outputs"]} />
    </details>
  </div>
);

const Summary = ({ session }: Props) => (
  <aside className="card">
    <p className="state-title">Summary (outputs)</p>
    <Totals session={session} />
    <OutputBoundary
      session={session}
      fallback={<p className="error">Price per unit is unavailable because quantity is missing.</p>}
    >
      <UnitPrice session={session} />
    </OutputBoundary>
    <p className="state-title">Quick view (same session)</p>
    <Field session={session} name="quantity" label="Quantity" />
    <Field session={session} name="total" label="Net total" />
  </aside>
);

const Totals = ({ session }: Props) => {
  const { totals, caption } = useOutputs(session);
  return (
    <dl className="summary" aria-label={caption}>
      <dt>Net</dt>
      <dd>{money(totals.net)}</dd>
      <dt>Tax</dt>
      <dd>{money(totals.tax)}</dd>
      <dt>Total</dt>
      <dd>
        <strong>{money(totals.gross)}</strong>
      </dd>
    </dl>
  );
};

const UnitPrice = ({ session }: Props) => {
  const { unitCaption } = useOutputs(session);
  return <p className="muted">{unitCaption}</p>;
};
