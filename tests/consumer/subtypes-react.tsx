// The renderers of subtypes, from the installed package: the binding takes
// them from its forms, infers their props inline, takes a class of the base as
// an explicit fallback, and rejects a missing renderer or a field of other
// forms, also through Field directly.
import { Component, type ComponentClass } from "react";
import {
  createForms,
  createSession,
  subtype,
  type OptionKey,
  type TextDefinition,
} from "trama-forms/core";
import {
  createReactBinding,
  type AsyncFieldProps,
  type CheckboxFieldProps,
  type SubtypeProps,
  type TextFieldProps,
} from "trama-forms/react";
import { forms, invoice } from "./subtypes.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expect = <T extends true>() => undefined as unknown as T;

const TextInput = ({ id, value }: TextFieldProps) => <input id={id} value={value} readOnly />;
class CheckboxInput extends Component<CheckboxFieldProps> {
  render() {
    return <input type="checkbox" checked={this.props.value} readOnly />;
  }
}
const AsyncInput = ({ value }: AsyncFieldProps) => <output>{value?.label}</output>;
// A renderer written apart takes the props of its subtype.
const SearchTable = ({ value, list, presentation }: SubtypeProps<typeof forms, "search">) => {
  expect<Equal<typeof presentation.columns, readonly string[]>>();
  return (
    <table>
      <tbody>
        {list.options.map((option) => (
          <tr key={option.value} aria-selected={option.value === value?.value}>
            {presentation.columns.map((column) => (
              <td key={column}>{String(option[column] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
const base = { text: TextInput, checkbox: CheckboxInput, async: AsyncInput };
const registry = {
  ...base,
  textarea: TextInput,
  toggle: CheckboxInput,
  combobox: ({ options }: SubtypeProps<typeof forms, "combobox">) => <i>{options.length}</i>,
  tags: ({ value }: SubtypeProps<typeof forms, "tags">) => <i>{value.length}</i>,
  search: SearchTable,
  chips: ({ value }: SubtypeProps<typeof forms, "chips">) => <i>{value.length}</i>,
};
export const ui = createReactBinding(
  {
    ...base,
    // Inline, the props of a subtype come from its key.
    textarea: ({ value, presentation }) => {
      expect<Equal<typeof presentation, { readonly rows?: number } | undefined>>();
      return <textarea rows={presentation?.rows} value={value} readOnly />;
    },
    // The renderer of the base is an explicit fallback, also a class.
    toggle: CheckboxInput,
    combobox: ({ options }) => <output>{options.length}</output>,
    tags: ({ value }) => <output>{value.join(", ")}</output>,
    search: SearchTable,
    chips: ({ value, presentation }) => (
      <output>
        {value.length}/{presentation?.max}
      </output>
    ),
  },
  { forms },
);
export const editor = () => ui.useFormSession(invoice, { scope: 1 });
const session = createSession(invoice, { scope: 1 });
const [key] = session.add("lines", [{}]);
const row = session.row("lines", key);
export const view = (
  <>
    <ui.Field session={session} name="notes" placeholder="Notes" />
    <ui.Field session={session} name="customer" />
    <ui.Field row={row} name="done" />
  </>
);

// Other forms with a subtype of the same name and another presentation.
const other = createForms({
  endpoints: [],
  subtypes: { textarea: subtype.text<{ mask: string }>() },
});
const masked = other.defineForm({
  fields: { notes: other.field.textarea({ presentation: { mask: "999" } }) },
  collections: {
    lines: { fields: { notes: other.field.textarea({ presentation: { mask: "9" } }) } },
  },
});
const foreign = createSession(masked);
const [line] = foreign.add("lines", [{}]);
const textareas = createReactBinding({ text: TextInput, textarea: TextInput }, { forms });
const bases = createReactBinding({ text: TextInput });
// @ts-expect-error A key is a field type or a subtype of the forms.
createReactBinding({ ...base, textareas: TextInput }, { forms });
// @ts-expect-error Without forms, a key is a field type.
createReactBinding({ ...base, textarea: TextInput });
createReactBinding(
  {
    textarea: ({ presentation }) => (
      // @ts-expect-error The renderer of a subtype reads its presentation with its type.
      <b>{presentation?.rows.toFixed(0)}</b>
    ),
  },
  { forms },
);
declare const Wide: ComponentClass<{ presentation: { columns: number } }>;
// @ts-expect-error A class of the subtype props does not fit: it takes the base ones.
createReactBinding({ search: Wide }, { forms });
const partial = createReactBinding({ ...registry, toggle: undefined }, { forms });
// @ts-expect-error useFormSession names the subtype without renderer.
partial.useFormSession(invoice, { scope: 1 });
// @ts-expect-error And the field of other forms.
textareas.useFormSession(masked);
const unbound = createForms({ endpoints: [], subtypes: { textarea: subtype.text() } });
const notes = unbound.defineForm({ fields: { notes: unbound.field.textarea() } });
// @ts-expect-error A binding without forms does not render a subtype.
bases.useFormSession(notes);
// In each member of a union of definitions, and of a union of sections.
declare const flag: boolean;
const plain = forms.defineForm({ fields: { notes: forms.field.textarea() } });
// @ts-expect-error A member with a field of other forms.
textareas.useFormSession(flag ? plain : masked);
declare const sections:
  | { notes: ReturnType<typeof other.field.textarea> }
  | { title: TextDefinition };
// @ts-expect-error A definition whose sections are a union.
textareas.useFormSession(other.defineForm({ fields: sections }));
const titled = forms.defineForm({ fields: { title: forms.field.text() } });
textareas.useFormSession(flag ? plain : titled);
const rowsOnly = other.defineForm({
  fields: {},
  collections: {
    lines: { fields: { notes: other.field.textarea({ presentation: { mask: "9" } }) } },
  },
});
// @ts-expect-error A member whose rows have a field of other forms.
textareas.useFormSession(flag ? titled : rowsOnly);
// @ts-expect-error Field rejects a field of other forms from a session.
void (<textareas.Field session={foreign} name="notes" />);
// @ts-expect-error And from a row.
void (<textareas.Field row={foreign.row("lines", line)} name="notes" />);
// @ts-expect-error Also with a registry of base renderers only.
void (<bases.Field session={foreign} name="notes" />);
// @ts-expect-error And from a row.
void (<bases.Field row={foreign.row("lines", line)} name="notes" />);
// A column of OptionKey in another subtype of objects.
const grid = createForms({
  endpoints: [],
  subtypes: { grid: subtype.async<{ columns: readonly { key: OptionKey; title?: string }[] }>() },
});
void grid;
