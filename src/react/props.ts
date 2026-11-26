import type {
  DeepReadonly,
  Option,
  OptionList,
  OptionListSnapshot,
  SelectOption,
} from "../core/index.js";

// The props of a renderer: the common ones of every field type, and those of its type.
export type CommonFieldProps<V> = {
  readonly id: string;
  readonly name: string;
  readonly label: string | undefined;
  readonly value: V;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  // The reasons of disabled and readOnly, in the order the session publishes them.
  readonly reasons: readonly string[];
  // The errors the policy of the binding shows, and the warnings, always.
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly dirty: boolean;
  readonly onChange: (value: V) => void;
  // Marks the field touched.
  readonly onBlur: () => void;
  // Reports the text the renderer could not convert into a value, or, without
  // a message, that it has none: call it after onChange, which may fail.
  readonly onInputError: (message?: string | undefined) => void;
};
export type TextFieldProps = CommonFieldProps<string> & {
  readonly placeholder: string | undefined;
};
// The decimals and the limits of the state of the field, undefined while no
// contribution gives them. They do not change the value.
export type NumberFieldProps = CommonFieldProps<number | null> & {
  readonly placeholder: string | undefined;
  readonly decimals: number | undefined;
  readonly min: number | undefined;
  readonly max: number | undefined;
};
// A civil date, YYYY-MM-DD, or null, and the limits of its state.
export type DateFieldProps = CommonFieldProps<string | null> & {
  readonly placeholder: string | undefined;
  readonly min: string | undefined;
  readonly max: string | undefined;
};
export type CheckboxFieldProps = CommonFieldProps<boolean>;
export type SelectFieldProps<V extends string | number = string | number> =
  CommonFieldProps<V | null> & {
    readonly options: readonly SelectOption<V>[];
  };
// The values of the chosen options, in the order the field holds them.
export type MultiSelectFieldProps<V extends string | number = string | number> = CommonFieldProps<
  readonly V[]
> & {
  readonly options: readonly SelectOption<V>[];
};
// The option list of the view, with its actions, which keep their identity.
export type OptionListProps<O> = OptionListSnapshot<O> &
  Omit<OptionList<O>, "getSnapshot" | "subscribe">;
// One renderer serves every async field, so its option is the base one.
// What a renderer receives from its view rather than from the definition.
export type ViewProps<O = Option> = { readonly list: OptionListProps<O> };
export type AsyncFieldProps<O = Option> = CommonFieldProps<DeepReadonly<O> | null> & {
  readonly placeholder: string | undefined;
} & ViewProps<O>;
// The chosen options, whole. The list of the view shows a page of the options,
// so a renderer keeps the chosen ones it does not see.
export type MultiAsyncFieldProps<O = Option> = CommonFieldProps<readonly DeepReadonly<O>[]> & {
  readonly placeholder: string | undefined;
} & ViewProps<O>;
