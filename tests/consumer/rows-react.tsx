import { memo } from "react";
import { createSession, defineForm, field, type RowHandleOf, type Session } from "trama-forms/core";
import {
  createReactBinding,
  useRows,
  type NumberFieldProps,
  type SelectFieldProps,
  type TextFieldProps,
} from "trama-forms/react";

const order = defineForm({
  fields: { notes: field.text(), rate: field.number() },
  collections: {
    lines: {
      fields: {
        quantity: field.number(),
        notes: field.text(),
        warehouse: field.select({ options: [{ value: "north", label: "North" }] }),
      },
    },
  },
});
const { Field } = createReactBinding({
  text: (props: TextFieldProps) => <input value={props.value} />,
  number: (props: NumberFieldProps) => <input value={props.value ?? ""} />,
  select: (props: SelectFieldProps) => <select aria-label={props.name} value={props.value ?? ""} />,
});
type Line = RowHandleOf<typeof order, "lines">;

// The table renders its keys and a row per key, with the same handle as a modal.
const Lines = ({ session }: { session: Session<typeof order> }) => {
  const keys = useRows(session, "lines");
  return (
    <table>
      <tbody>
        {keys.map((key, index) => (
          <LineRow key={key} line={session.row("lines", key)} number={index + 1} />
        ))}
      </tbody>
    </table>
  );
};
const LineRow = memo(function LineRow({ line, number }: { line: Line; number: number }) {
  return (
    <tr>
      <th scope="row">{number}</th>
      <td>
        <Field row={line} name="quantity" />
      </td>
      <td>
        <Field row={line} name="notes" label="Line note" placeholder="Optional" />
      </td>
    </tr>
  );
});
const LineModal = ({ line }: { line: Line }) => (
  <dialog open>
    <Field row={line} name="quantity" />
  </dialog>
);
const session = createSession(order);
const [key] = session.add("lines", [{}]);
void (<Lines session={session} />);
void (<LineModal line={session.row("lines", key)} />);
void (<Field session={session} name="notes" placeholder="Notes" />);

// A cell typed by a partial row serves any form with that collection.
const QuantityCell = ({ line }: { line: RowHandleOf<typeof order, "lines"> }) => (
  <Field row={line} name="quantity" />
);
void QuantityCell;

// @ts-expect-error A row names fields of its collection.
void (<Field row={session.row("lines", key)} name="pric" />);
// @ts-expect-error A collection is no field of a session.
void (<Field session={session} name="lines" />);
// @ts-expect-error A select of a row takes no placeholder.
void (<Field row={session.row("lines", key)} name="warehouse" placeholder="Choose" />);
// @ts-expect-error A session is not a row.
void (<Field row={session} name="notes" />);
// @ts-expect-error A row is not a session.
void (<Field session={session.row("lines", key)} name="notes" />);
export const Unknown = () => {
  // @ts-expect-error A collection of the form.
  useRows(session, "line");
  return null;
};
