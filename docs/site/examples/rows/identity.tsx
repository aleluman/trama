import { useSyncExternalStore } from "react";
import { defineForm, type RowKey, type Session } from "trama-forms/core";
import { useRows } from "trama-forms/react";
import { Field, useFormSession } from "../../ui/form-ui";
import { order } from "./order";

// Counts how often each line's amount formula ran, by row key. Keys are unique
// across the page, so the counter keeps rows from different sessions distinct.
const runs = new Map<RowKey, number>();
const counted = defineForm({
  fields: order.fields,
  collections: order.collections,
  rules: {
    lines: {
      each: {
        amount: {
          value: ({ quantity, price }, { key }) => {
            runs.set(key, (runs.get(key) ?? 0) + 1);
            return (quantity ?? 0) * (price ?? 0);
          },
        },
      },
    },
  },
});

export const Demo = () => {
  const editor = useFormSession(counted, {
    initial: {
      notes: "Test order",
      lines: [
        { id: "L-1", quantity: 2, price: 120 },
        { id: "L-2", quantity: 5, price: 80 },
        { id: "L-3", quantity: 1, price: 15 },
      ],
    },
  });
  if (editor.status !== "ready") return null;
  const { session } = editor;
  return <Identity session={session} />;
};

const Identity = ({ session }: { session: Session<typeof counted> }) => {
  const keys = useRows(session, "lines");
  const { resetVersion } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [first] = keys;
  return (
    <>
      <Field session={session} name="notes" />
      <ol className="line-list">
        {keys.map((key, index) => (
          <LineItem
            key={key}
            session={session}
            line={key}
            position={index}
            last={index === keys.length - 1}
          />
        ))}
      </ol>
      <div className="actions">
        <button
          type="button"
          disabled={first === undefined}
          onClick={() => {
            if (first !== undefined)
              session.patch({ notes: "Price corrected", lines: { [first]: { price: 99 } } });
          }}
        >
          Correct price and note
        </button>
        <button type="button" onClick={() => session.add("lines", [{ quantity: 4, price: 10 }])}>
          Add line
        </button>
        <button type="button" onClick={() => session.reset()}>
          Reset
        </button>
      </div>
      <p className="muted">
        rows.lines: [{keys.join(", ")}] · resetVersion: {resetVersion}
      </p>
    </>
  );
};

// A line with its values and the number of times its amount was calculated. It reads
// the row through its handle, which follows the row when it moves.
const LineItem = ({
  session,
  line,
  position,
  last,
}: {
  session: Session<typeof counted>;
  line: RowKey<"lines">;
  position: number;
  last: boolean;
}) => {
  const handle = session.row("lines", line);
  const snapshot = useSyncExternalStore(handle.subscribe, handle.getSnapshot);
  // The counter lives outside React and is read like any external data.
  const count = useSyncExternalStore(handle.subscribe, () => runs.get(line) ?? 0);
  if (snapshot === undefined) return null;
  const { id, quantity, price, amount } = snapshot.values;
  return (
    <li>
      <code>{line}</code> · {id === "" ? "(new)" : id} · {quantity} × {price} = {amount} · amount
      calculated {count} {count === 1 ? "time" : "times"}
      <Field row={handle} name="quantity" label="Quantity" />
      <div className="actions">
        <button
          type="button"
          disabled={last}
          onClick={() => session.move("lines", line, position + 1)}
        >
          Move down
        </button>
        <button type="button" onClick={() => session.remove("lines", [line])}>
          Remove
        </button>
      </div>
    </li>
  );
};
