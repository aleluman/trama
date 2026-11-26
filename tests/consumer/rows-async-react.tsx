// Async fields in rows with React: a table with useRows and, per row, <Field
// row> for its product and lot, and a modal that edits a line with the same
// handle, whose lot is another view with its own search.
import { memo } from "react";
import type { RowHandleOf, Session } from "trama-forms/core";
import {
  createReactBinding,
  useRows,
  type AsyncFieldProps,
  type NumberFieldProps,
  type SelectFieldProps,
  type TextFieldProps,
} from "trama-forms/react";
import { order } from "./rows-async.js";

const { Field, useFormSession } = createReactBinding({
  text: (props: TextFieldProps) => <input value={props.value} />,
  number: (props: NumberFieldProps) => <input value={props.value ?? ""} />,
  select: (props: SelectFieldProps) => <select aria-label={props.name} value={props.value ?? ""} />,
  async: ({ value, list }: AsyncFieldProps) => (
    <div>
      <input value={value?.label ?? list.text} readOnly />
      <button onClick={list.open}>Open</button>
    </div>
  ),
});
type Line = RowHandleOf<typeof order, "lines">;

export const Editor = ({ id }: { id: string }) => {
  const editor = useFormSession(order, {
    key: id,
    scope: "acme",
    context: { mode: "edit" },
    initial: { lines: [{ warehouse: "central", quantity: 2 }] },
  });
  if (editor.status !== "ready") return null;
  return <Lines session={editor.session} />;
};

const Lines = ({ session }: { session: Session<typeof order> }) => {
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

// A RowHandleOf as the prop of a memo component: the handle is the same object
// while the row exists, so editing another line does not render this one.
const LineRow = memo(function LineRow({ line }: { line: Line }) {
  return (
    <tr>
      <td>
        <Field row={line} name="product" />
      </td>
      <td>
        <Field row={line} name="lot" placeholder="Lot" />
      </td>
      <td>
        <Field row={line} name="quantity" />
      </td>
    </tr>
  );
});

// The modal edits the same line with the same handle.
export const LineModal = ({ line }: { line: Line }) => (
  <dialog open>
    <Field row={line} name="product" />
    <Field row={line} name="warehouse" />
    <Field row={line} name="lot" />
  </dialog>
);

export const Negatives = ({ line }: { line: Line }) => (
  <>
    {/* @ts-expect-error A row names fields of its collection. */}
    <Field row={line} name="lott" />
    {/* @ts-expect-error A select of a row takes no placeholder. */}
    <Field row={line} name="warehouse" placeholder="Choose" />
    {/* @ts-expect-error A field of a row is not a field of the session. */}
    <Field session={line} name="lot" />
  </>
);

// A binding without an async renderer does not cover a form whose rows have
// async fields.
const noAsync = createReactBinding({
  text: (props: TextFieldProps) => <input value={props.value} />,
  number: (props: NumberFieldProps) => <input value={props.value ?? ""} />,
  select: (props: SelectFieldProps) => <select aria-label={props.name} value={props.value ?? ""} />,
});
export const Uncovered = ({ line }: { line: Line }) => {
  // @ts-expect-error useFormSession requires the renderer of every field type, also of rows.
  noAsync.useFormSession(order, { key: "1", scope: "acme", context: { mode: "edit" } });
  // @ts-expect-error And so does Field with a row.
  return <noAsync.Field row={line} name="lot" />;
};
