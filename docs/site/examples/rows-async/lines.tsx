import { useEffect, useRef, useState } from "react";
import type { RowHandleOf, RowKey, Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { Field, useFormSession } from "../../ui/form-ui";
import { initial, order } from "./order";
import { Server } from "./server";

type Line = RowHandleOf<typeof order, "lines">;
type Key = RowKey<"lines">;

export const Demo = () => {
  const editor = useFormSession(order, { scope: "inventory", initial });
  if (editor.status !== "ready") return null;
  return <Lines session={editor.session} />;
};

const Lines = ({ session }: { session: Session<typeof order> }) => {
  const keys = useRows(session, "lines");
  const [open, setOpen] = useState<Key>();
  const move = (key: Key, by: number) => session.move("lines", key, keys.indexOf(key) + by);
  return (
    <>
      <div className="table-scroll lines-table">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Product</th>
              <th scope="col">Warehouse</th>
              <th scope="col">Lot</th>
              <th scope="col">Quantity</th>
              <th scope="col">Actions</th>
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
                onOpen={setOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" onClick={() => session.add("lines", [{}])}>
          Add line
        </button>
      </div>
      <Server />
      {open !== undefined && (
        <LineModal line={session.row("lines", open)} onClose={() => setOpen(undefined)} />
      )}
    </>
  );
};

const columns = ["product", "warehouse", "lot", "quantity"] as const;

// Each async <Field row> is a view with its own list, which requests using its row's parameters.
const LineRow = (props: {
  line: Line;
  number: number;
  last: boolean;
  onMove: (key: Key, by: number) => void;
  onOpen: (key: Key) => void;
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
      <td className="row-actions">
        <button type="button" disabled={number === 1} onClick={() => props.onMove(line.key, -1)}>
          Move up
        </button>
        <button type="button" disabled={props.last} onClick={() => props.onMove(line.key, 1)}>
          Move down
        </button>
        <button type="button" onClick={() => props.onOpen(line.key)}>
          Open
        </button>
      </td>
    </tr>
  );
};

// The modal uses the same handle. Its async fields are separate views and search independently.
const LineModal = ({ line, onClose }: { line: Line; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-label="Line" onClose={onClose}>
      <div className="columns">
        <Field row={line} name="product" />
        <Field row={line} name="warehouse" />
        <Field row={line} name="lot" />
      </div>
      <div className="actions">
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
};
