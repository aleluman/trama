// Queries in rows with React: each line renders its fields with <Field row>
// and a status cell that reads the state of its price from its handle, with a
// selector, and retries it.
import { memo, useCallback, useSyncExternalStore } from "react";
import type { QueryState, RowHandleOf, Session } from "trama-forms/core";
import {
  createReactBinding,
  useRows,
  type AsyncFieldProps,
  type NumberFieldProps,
  type SelectFieldProps,
  type TextFieldProps,
} from "trama-forms/react";
import type { Equal } from "./rows-async.js";
import { order } from "./rows-queries.js";

const { Field } = createReactBinding({
  text: (props: TextFieldProps) => <input value={props.value} />,
  number: (props: NumberFieldProps) => <input value={props.value ?? ""} />,
  select: (props: SelectFieldProps) => <select aria-label={props.name} value={props.value ?? ""} />,
  async: ({ value, list }: AsyncFieldProps) => <input value={value?.label ?? list.text} readOnly />,
});
type Line = RowHandleOf<typeof order, "lines">;

export const Lines = ({ session }: { session: Session<typeof order> }) => {
  const keys = useRows(session, "lines");
  return (
    <table>
      <tbody>
        {keys.map((key) => (
          <LineRow key={key} line={session.row("lines", key)} />
        ))}
      </tbody>
    </table>
  );
};

const LineRow = memo(function LineRow({ line }: { line: Line }) {
  return (
    <tr>
      <td>
        <Field row={line} name="product" />
      </td>
      <td>
        <Field row={line} name="price" />
      </td>
      <td>
        <PriceStatus line={line} />
      </td>
    </tr>
  );
});

// The selector returns the state of the query, which keeps its identity, so
// the cell renders only when that state changes.
const PriceStatus = ({ line }: { line: Line }) => {
  const state = useSyncExternalStore(line.subscribe, () => line.getSnapshot()?.queries.price);
  const retry = useCallback(() => line.retry("price"), [line]);
  void (true satisfies Equal<typeof state, QueryState | undefined>);
  if (state === undefined || state.status === "idle") return null;
  if (state.status === "pending") return <output>Querying…</output>;
  return (
    <span role="alert">
      {state.error?.message}
      <button type="button" onClick={retry}>
        Retry
      </button>
    </span>
  );
};
