import { useEffect, useRef, useState } from "react";
import type { RowHandleOf, RowKey, Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { Field, useFormSession } from "../../ui/form-ui";
import { initial, order } from "./order";

type Line = RowHandleOf<typeof order, "lines">;
type Key = RowKey<"lines">;

export const Demo = () => {
  const editor = useFormSession(order, { context: { sent: false }, initial });
  if (editor.status !== "ready") return null;
  return <Lines session={editor.session} />;
};

// Duplicating adds a row below with the original row's values. The application omits
// the persisted ID and the amount, which is calculated again.
const duplicate = (session: Session<typeof order>, keys: readonly Key[], key: Key) => {
  const values = session.row("lines", key).getSnapshot()?.values;
  if (values === undefined) return;
  const { id: _id, amount: _amount, ...copy } = values;
  session.add("lines", [copy], { at: keys.indexOf(key) + 1 });
};

const head = (
  <thead>
    <tr>
      <th scope="col">#</th>
      <th scope="col">ID</th>
      <th scope="col">Product</th>
      <th scope="col">Quantity</th>
      <th scope="col">Amount</th>
      <th scope="col">Actions</th>
    </tr>
  </thead>
);

const Lines = ({ session }: { session: Session<typeof order> }) => {
  // The keys retain their identity while the rows and their order stay the same.
  // Writing to a line does not rerender the table.
  const keys = useRows(session, "lines");
  const [selected, setSelected] = useState<ReadonlySet<Key>>(new Set());
  const [open, setOpen] = useState<Key>();
  const toggle = (key: Key) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const remove = () => {
    session.remove("lines", [...selected]);
    setSelected(new Set());
  };
  const move = (key: Key, by: number) => session.move("lines", key, keys.indexOf(key) + by);
  return (
    <>
      <div className="table-scroll lines-table">
        <table>
          {head}
          <tbody>
            {keys.map((key, index) => (
              <LineRow
                key={key}
                line={session.row("lines", key)}
                number={index + 1}
                last={index === keys.length - 1}
                selected={selected.has(key)}
                onToggle={toggle}
                onMove={move}
                onDuplicate={(line) => duplicate(session, keys, line)}
                onOpen={setOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Actions session={session} selected={selected} onRemove={remove} />
      {open !== undefined && (
        <LineModal line={session.row("lines", open)} onClose={() => setOpen(undefined)} />
      )}
    </>
  );
};

const Actions = ({
  session,
  selected,
  onRemove,
}: {
  session: Session<typeof order>;
  selected: ReadonlySet<Key>;
  onRemove: () => void;
}) => (
  <div className="actions">
    <button type="button" onClick={() => session.add("lines", [{}])}>
      Add at end
    </button>
    <button type="button" onClick={() => session.add("lines", [{}], { at: 0 })}>
      Add at start
    </button>
    <button type="button" disabled={selected.size === 0} onClick={onRemove}>
      Remove selected ({selected.size})
    </button>
  </div>
);

const columns = ["id", "product", "quantity", "amount"] as const;

const LineRow = (props: {
  line: Line;
  number: number;
  last: boolean;
  selected: boolean;
  onToggle: (key: Key) => void;
  onMove: (key: Key, by: number) => void;
  onDuplicate: (key: Key) => void;
  onOpen: (key: Key) => void;
}) => {
  const { line, number } = props;
  return (
    <tr>
      <th scope="row">
        <input
          type="checkbox"
          aria-label={`Select line ${number}`}
          checked={props.selected}
          onChange={() => props.onToggle(line.key)}
        />{" "}
        {number}
      </th>
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
        <button type="button" onClick={() => props.onDuplicate(line.key)}>
          Duplicate
        </button>
        <button type="button" onClick={() => props.onOpen(line.key)}>
          Open
        </button>
      </td>
    </tr>
  );
};

// The modal edits the same row with the same handle. Edits are already in the session.
// There is no draft to cancel, so the button says “Close”.
const LineModal = ({ line, onClose }: { line: Line; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-label="Line" onClose={onClose}>
      <div className="columns">
        <Field row={line} name="product" />
        <Field row={line} name="quantity" />
        <Field row={line} name="price" />
        <Field row={line} name="discount" />
        <Field row={line} name="lot" />
        <Field row={line} name="warehouse" />
      </div>
      <Field row={line} name="notes" />
      <div className="actions">
        <button type="button" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
};
