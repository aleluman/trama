import type { ComponentType } from "react";
import { jsx } from "react/jsx-runtime";
import type { FieldDefinition } from "../core/index.js";
import { AsyncField } from "./async.js";
import { rendererOf, subtypeOf, type RendererTable } from "./coverage.js";
import type { ShowErrors } from "./visible-messages.js";
import { useField, type AnyState, type FieldSource } from "./field.js";
import type {
  AsyncFieldProps,
  CheckboxFieldProps,
  CommonFieldProps,
  DateFieldProps,
  MultiAsyncFieldProps,
  MultiSelectFieldProps,
  NumberFieldProps,
  SelectFieldProps,
  TextFieldProps,
  ViewProps,
} from "./props.js";

// The props of the renderer of each field type.
type Props = {
  text: TextFieldProps;
  number: NumberFieldProps;
  checkbox: CheckboxFieldProps;
  select: SelectFieldProps;
  async: AsyncFieldProps;
  date: DateFieldProps;
  multiSelect: MultiSelectFieldProps;
  multiAsync: MultiAsyncFieldProps;
};
type PlaceholderType = {
  [T in FieldDefinition["type"]]: "placeholder" extends keyof Extract<FieldDefinition, { type: T }>
    ? T
    : never;
}[FieldDefinition["type"]];
// The props of a renderer that are not common to every field type, exactly:
// the common ones and the ones of other types are forbidden. The list comes
// from the view, not from the definition.
type OwnProps<T extends keyof Props> = Omit<
  Props[T],
  keyof CommonFieldProps<unknown> | keyof ViewProps
>;
type OwnKeys = { [T in keyof Props]: keyof OwnProps<T> }[keyof Props];
type TypeProps<T extends keyof Props> = OwnProps<T> & {
  readonly [P in Exclude<OwnKeys, keyof OwnProps<T>> | keyof CommonFieldProps<unknown>]?: never;
};
// What each field type adds to the common props of its renderer, from its
// definition and its state. Every field type of the core needs one, with a
// placeholder exactly when its definition declares one.
const placeholderProps = (_: unknown, placeholder: string | undefined) => ({ placeholder });
const optionProps = <O>(item: { readonly options: O }) => ({ options: item.options });
export const typeProps = {
  text: placeholderProps,
  number: (_, placeholder, { decimals, min, max }) => ({ placeholder, decimals, min, max }),
  checkbox: () => ({}),
  select: optionProps,
  async: placeholderProps,
  date: (_, placeholder, { min, max }) => ({ placeholder, min, max }),
  multiSelect: optionProps,
  multiAsync: placeholderProps,
} satisfies {
  readonly [T in FieldDefinition["type"]]: (
    item: Extract<FieldDefinition, { type: T }>,
    placeholder: string | undefined,
    // The state of a field has the limits of its type, as its renderer takes them.
    state: Partial<OwnProps<T>>,
  ) => TypeProps<T> &
    (T extends PlaceholderType
      ? { readonly placeholder: string | undefined }
      : { readonly placeholder?: never });
};
// Whether the renderer of each field type takes the list of its view, as its
// props say.
const listed = {
  text: false,
  number: false,
  checkbox: false,
  select: false,
  async: true,
  date: false,
  multiSelect: false,
  multiAsync: true,
} satisfies {
  readonly [T in keyof Props]: "list" extends keyof Props[T] ? true : false;
};

// What a Field takes besides its source.
export type FieldProps = {
  readonly name: string;
  readonly label?: string | undefined;
  readonly placeholder?: string | undefined;
};
// Renders the field name of a source, or nothing for a row that no longer
// exists or a hidden field. The props of a Field override the label and the
// placeholder of the state.
export const useFieldRenderer = (
  renderers: RendererTable,
  source: FieldSource,
  props: FieldProps,
  policy: ShowErrors,
) => {
  const { name } = props;
  const item = Object.hasOwn(source.fields, name) ? source.fields[name] : undefined;
  if (item === undefined) throw new Error(`Unknown field "${name}"`);
  const { id, selection, view, key } = useField(source, name, policy);
  if (selection === undefined || selection.state.hidden) return null;
  const { value, state, resetVersion, errors } = selection;
  const common = {
    id,
    name,
    label: props.label ?? state.label,
    disabled: state.disabled,
    readOnly: state.readOnly,
    required: state.required,
    reasons: state.reasons,
    errors,
    warnings: state.warnings,
    dirty: state.dirty,
    onBlur: view.touch,
    onInputError: view.report,
  };
  return renderField(renderers, source.list, item, value, view.edit, common, {
    placeholder: props.placeholder ?? state.placeholder,
    state,
    key: `${key}:${resetVersion}`,
  });
};

// The element of the renderer, whose key, out of its props, remounts it with
// another source, name or reset: jsx takes the props as they are, without
// copying them.
const renderField = (
  renderers: RendererTable,
  lists: FieldSource["list"],
  item: FieldDefinition,
  value: unknown,
  edit: (next: unknown) => void,
  common: Omit<CommonFieldProps<unknown>, "value" | "onChange">,
  {
    placeholder,
    state,
    key,
  }: { readonly placeholder: string | undefined; readonly state: AnyState; readonly key: string },
) => {
  // TypeScript does not relate the type of a field to its renderer, its state
  // and its own props, so the lookups and the element are cast.
  const own = (typeProps[item.type] as (...args: [FieldDefinition, unknown, AnyState]) => object)(
    item,
    placeholder,
    state,
  );
  const Renderer = rendererOf(renderers, item, `Field "${common.name}"`) as ComponentType<
    CommonFieldProps<unknown>
  >;
  // The presentation of a subtype is frozen in its definition: the renderer
  // receives the same object at every render.
  const props = {
    ...common,
    value,
    onChange: edit,
    ...own,
    ...(subtypeOf(item) === undefined
      ? undefined
      : { presentation: (item as { readonly presentation?: unknown }).presentation }),
  };
  // The list of a remote field belongs to the view.
  if (listed[item.type]) return jsx(AsyncField, { ...props, renderer: Renderer, lists }, key);
  return jsx(Renderer, props, key);
};
