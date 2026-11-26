import { useEffect, useState, useSyncExternalStore } from "react";
import type { RowHandleOf, RowKey, Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { Field, useFormSession } from "../../ui/form-ui";
import { failNextPrice } from "./api";
import { initial, priced } from "./priced";
import { Server } from "./server";

type Line = RowHandleOf<typeof priced, "lines">;
type Key = RowKey<"lines">;

export const Demo = () => {
  const editor = useFormSession(priced, { scope: "inventory", initial });
  if (editor.status !== "ready") return null;
  return <Lines session={editor.session} />;
};

const Lines = ({ session }: { session: Session<typeof priced> }) => (
  <>
    <div className="columns">
      <Field session={session} name="priceList" />
    </div>
    <Table session={session} />
    <div className="actions">
      <button type="button" onClick={() => session.add("lines", [{}])}>
        Add line
      </button>
      <button type="button" onClick={() => session.reset()}>
        Discard changes
      </button>
      <button type="button" className="quiet" onClick={failNextPrice}>
        Fail the next price request
      </button>
    </div>
    <Publications session={session} />
    <Server />
  </>
);

const Table = ({ session }: { session: Session<typeof priced> }) => {
  const keys = useRows(session, "lines");
  const move = (key: Key, by: number) => session.move("lines", key, keys.indexOf(key) + by);
  // The copy supplies the line's price and lot, so they are not queried.
  const duplicate = (key: Key) => {
    const values = session.row("lines", key).getSnapshot()?.values;
    if (values !== undefined) session.add("lines", [values], { at: keys.indexOf(key) + 1 });
  };
  return (
    <div className="table-scroll lines-table">
      <table>
        <thead>
          <tr>
            {["#", "Product", "Warehouse", "Lot", "Quantity", "Price", "Status", "Actions"].map(
              (title) => (
                <th key={title} scope="col">
                  {title}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {keys.map((key, index) => (
            <LineRow
              key={key}
              line={session.row("lines", key)}
              number={index + 1}
              last={index === keys.length - 1}
              onMove={move}
              onDuplicate={duplicate}
              onRemove={(removed) => session.remove("lines", [removed])}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

const columns = ["product", "warehouse", "lot", "quantity", "price"] as const;

const LineRow = (props: {
  line: Line;
  number: number;
  last: boolean;
  onMove: (key: Key, by: number) => void;
  onDuplicate: (key: Key) => void;
  onRemove: (key: Key) => void;
}) => {
  const { line, number } = props;
  return (
    <tr>
      <th scope="row">{number}</th>
      {columns.map((name) => (
        <td key={name}>
          <Field row={line} name={name} />
        </td>
      ))}
      <td>
        <PriceStatus line={line} />
      </td>
      <td className="row-actions">
        <button type="button" disabled={number === 1} onClick={() => props.onMove(line.key, -1)}>
          Move up
        </button>
        <button type="button" disabled={props.last} onClick={() => props.onMove(line.key, 1)}>
          Move down
        </button>
        <button type="button" onClick={() => props.onDuplicate(line.key)}>
          Duplicate
        </button>
        <button type="button" onClick={() => props.onRemove(line.key)}>
          Remove
        </button>
      </td>
    </tr>
  );
};

// The line's handle provides the price query state. The selector returns the state object,
// which retains its identity. The cell only rerenders when it changes.
const PriceStatus = ({ line }: { line: Line }) => {
  const state = useSyncExternalStore(line.subscribe, () => line.getSnapshot()?.queries.price);
  if (state === undefined || state.status === "idle") return null;
  if (state.status === "pending") return <output>Querying…</output>;
  return (
    <span role="alert">
      {state.error?.message}{" "}
      <button type="button" onClick={() => line.retry("price")}>
        Retry
      </button>
    </span>
  );
};

// Publications since the last price list change include the edit and any that follow it,
// which are the responses if you make no other changes. Responses that arrive together are
// applied in one operation and publish once. Discarding changes starts over.
const Publications = ({ session }: { session: Session<typeof priced> }) => {
  const [after, setAfter] = useState<number>();
  useEffect(() => {
    let { resetVersion, values } = session.getSnapshot();
    return session.subscribe(() => {
      const snapshot = session.getSnapshot();
      if (snapshot.resetVersion !== resetVersion) setAfter(undefined);
      else if (snapshot.values.priceList === values.priceList)
        setAfter((count) => (count === undefined ? count : count + 1));
      else setAfter(0);
      ({ resetVersion, values } = snapshot);
    });
  }, [session]);
  return (
    <div className="state-panel" aria-label="Publications">
      <strong>Publications since the last price list change</strong>
      {after === undefined ? (
        <span>You have not changed the price list yet.</span>
      ) : (
        <span>
          Edit: <output>1</output> · afterward: <output>{after}</output>
        </span>
      )}
    </div>
  );
};
