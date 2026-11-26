// The renderers of dates and multiple values, from the installed package:
// their props, the list of a remote multiple field, and the coverage of
// definitions that have them.
import { createSession, type Option } from "trama-forms/core";
import {
  createReactBinding,
  type DateFieldProps,
  type MultiAsyncFieldProps,
  type MultiSelectFieldProps,
  type TextFieldProps,
} from "trama-forms/react";
import { report } from "./multiple.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expect = <T extends true>() => undefined as unknown as T;

const text = (props: TextFieldProps) => <span>{props.value}</span>;
// A date input writes a civil date or null.
const DateInput = ({ value, placeholder }: DateFieldProps) => (
  <input type="date" value={value ?? ""} placeholder={placeholder} readOnly />
);
const clear = ({ onChange }: DateFieldProps) => onChange(null);
// Chips keep the chosen options that the page of the list does not show.
const Chips = ({ value, list }: MultiAsyncFieldProps) => (
  <div>
    {value.map((option) => (
      <span key={option.value}>{option.label}</span>
    ))}
    {list.options.map((option) => (
      <span key={option.value}>{option.label}</span>
    ))}
  </div>
);
const add = ({ value, list, onChange }: MultiAsyncFieldProps) => {
  const [first] = list.options;
  if (first !== undefined) onChange([...value, first]);
};
void [clear, add];
export const ui = createReactBinding({
  text,
  date: DateInput,
  multiAsync: Chips,
  // Inline, the props of a static multiple field come from its key.
  multiSelect: ({ value, options, onChange }) => {
    expect<Equal<typeof value, readonly (string | number)[]>>();
    onChange(options.map((option) => option.value));
    return <output>{value.join(", ")}</output>;
  },
});
const session = createSession(report, { scope: "acme" });
export const view = (
  <>
    <ui.Field session={session} name="kinds" />
    <ui.Field session={session} name="from" placeholder="From" />
    <ui.Field session={session} name="subfamilies" placeholder="All" />
  </>
);
// @ts-expect-error A static multiple field takes no placeholder in the view.
void (<ui.Field session={session} name="kinds" placeholder="All" />);
// The value of a renderer keeps the cardinality of its field.
const multiple = (props: MultiSelectFieldProps<"sale">) => props.value satisfies readonly "sale"[];
const options = (props: MultiAsyncFieldProps<Option<{ code: string }>>) =>
  props.value.map((option) => option.code);
void [multiple, options];
// @ts-expect-error A binding without the renderers of the new types does not cover the report.
createReactBinding({ text }).useFormSession(report, { scope: "acme" });
