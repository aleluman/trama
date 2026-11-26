import type { DeepReadonly, Option } from "./data.js";

// Every optional property of the authoring also takes undefined, which means
// the same as leaving it out.
type Presentation = {
  readonly label?: string | undefined;
  readonly placeholder?: string | undefined;
};
// State declared in the field: each true or reason is a contribution that no
// rule withdraws. A reason means true, and it must not be empty.
export type DeclaredState = {
  readonly disabled?: boolean | string | undefined;
  readonly readOnly?: boolean | string | undefined;
  readonly hidden?: boolean | undefined;
  // A non-empty text is the message of required.
  readonly required?: boolean | string | undefined;
};
export type TextDefinition = Presentation &
  DeclaredState & {
    readonly type: "text";
    readonly default?: string | undefined;
  };
// decimals, min and max start the state of the field; the value takes no
// rounding nor bounds from them. A definition takes no null.
export type NumberDefinition = Presentation &
  DeclaredState & {
    readonly type: "number";
    readonly default?: number | null | undefined;
    readonly decimals?: number | undefined;
    readonly min?: number | undefined;
    readonly max?: number | undefined;
  };
export type CheckboxDefinition = DeclaredState & {
  readonly type: "checkbox";
  readonly label?: string | undefined;
  readonly default?: boolean | undefined;
};
// A civil date, YYYY-MM-DD, without time or time zone, and limits of the same
// form.
export type DateDefinition = Presentation &
  DeclaredState & {
    readonly type: "date";
    readonly default?: string | null | undefined;
    readonly min?: string | undefined;
    readonly max?: string | undefined;
  };
export type SelectOption<V extends string | number = string | number> = {
  readonly value: V;
  readonly label: string;
};
export type SelectDefinition<V extends string | number = string | number> = DeclaredState & {
  readonly type: "select";
  readonly label?: string | undefined;
  readonly options: readonly SelectOption<V>[];
  readonly default?: V | null | undefined;
};
// The values of some of its options, in any order and without repeats. The
// default of V keeps the literals that a rule writes in an array, without
// as const, when the field does not narrow it.
export type MultiSelectDefinition<
  V extends string | number = (string & {}) | "" | (number & {}) | 0,
> = DeclaredState & {
  readonly type: "multiSelect";
  readonly label?: string | undefined;
  readonly options: readonly SelectOption<V>[];
  readonly default?: readonly V[] | undefined;
};
// A field whose options an endpoint gives, and whose value is the whole
// option, or some of them. Only the field of createForms creates it: the option
// O and the params P of its endpoint are part of its type, not of the object.
declare const asyncTypes: unique symbol;
type AsyncTypes<O, P> = {
  readonly [asyncTypes]: { readonly option: O; readonly params: P };
};
export type AsyncConfig<O> = Presentation &
  DeclaredState & {
    readonly default?: DeepReadonly<O> | null | undefined;
  };
// The default is the public Option, since a consumer's declarations print it.
export type AsyncDefinition<O = Option, P = unknown, K extends string = string> = AsyncConfig<O> &
  AsyncTypes<O, P> & {
    readonly type: "async";
    readonly endpoint: K;
  };
export type MultiAsyncConfig<O> = Presentation &
  DeclaredState & {
    readonly default?: readonly DeepReadonly<O>[] | undefined;
  };
export type MultiAsyncDefinition<
  O = Option,
  P = unknown,
  K extends string = string,
> = MultiAsyncConfig<O> &
  AsyncTypes<O, P> & {
    readonly type: "multiAsync";
    readonly endpoint: K;
  };
// The fields whose options an endpoint gives.
export type RemoteDefinition = AsyncDefinition | MultiAsyncDefinition;
// The option and the params of a remote definition.
export type OptionOf<D> = D extends AsyncTypes<infer O, unknown> ? O : never;
export type ParamsOf<D> = D extends AsyncTypes<unknown, infer P> ? P : never;
// The field types of the core, which its defineForm accepts.
export type CoreDefinition =
  | TextDefinition
  | NumberDefinition
  | CheckboxDefinition
  | SelectDefinition
  | DateDefinition
  | MultiSelectDefinition;
export type FieldDefinition = CoreDefinition | RemoteDefinition;
export type FieldValue<F extends FieldDefinition> = F extends TextDefinition
  ? string
  : F extends NumberDefinition
    ? number | null
    : F extends CheckboxDefinition
      ? boolean
      : F extends SelectDefinition<infer V>
        ? V | null
        : F extends AsyncTypes<infer O, unknown>
          ? F extends { readonly type: "multiAsync" }
            ? readonly DeepReadonly<O>[]
            : DeepReadonly<O> | null
          : F extends DateDefinition
            ? string | null
            : F extends MultiSelectDefinition<infer V>
              ? readonly V[]
              : never;
export const field = {
  text: (config: Omit<TextDefinition, "type"> = {}): TextDefinition => ({
    ...config,
    type: "text",
  }),
  number: (config: Omit<NumberDefinition, "type"> = {}): NumberDefinition => ({
    ...config,
    type: "number",
  }),
  checkbox: (config: Omit<CheckboxDefinition, "type"> = {}): CheckboxDefinition => ({
    ...config,
    type: "checkbox",
  }),
  date: (config: Omit<DateDefinition, "type"> = {}): DateDefinition => ({
    ...config,
    type: "date",
  }),
  select: <const V extends string | number>(
    config: DeclaredState & {
      readonly label?: string | undefined;
      readonly options: readonly SelectOption<V>[];
      readonly default?: NoInfer<V> | null | undefined;
    },
  ): SelectDefinition<V> => ({ ...config, type: "select" }),
  multiSelect: <const V extends string | number>(
    config: DeclaredState & {
      readonly label?: string | undefined;
      readonly options: readonly SelectOption<V>[];
      readonly default?: readonly NoInfer<V>[] | undefined;
    },
  ): MultiSelectDefinition<V> => ({ ...config, type: "multiSelect" }),
};

// The field types whose definition declares a placeholder.
type PlaceholderType = {
  [T in FieldDefinition["type"]]: "placeholder" extends keyof Extract<FieldDefinition, { type: T }>
    ? T
    : never;
}[FieldDefinition["type"]];
export type WithPlaceholder = { readonly type: PlaceholderType };
