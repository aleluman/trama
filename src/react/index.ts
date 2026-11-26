import type { ComponentClass, ComponentProps, ComponentType, ReactElement } from "react";
import type {
  BoundField,
  DeepReadonly,
  FieldDefinition,
  FormDefinition,
  Loader,
  Option,
  OptionKey,
  QueryState,
  RowHandle,
  RowSnapshot,
  Session,
  Snapshot,
} from "../core/index.js";
import { bind } from "./binding.js";
import type { FormEditor, SessionArgument } from "./opening.js";
import type {
  AsyncFieldProps,
  CheckboxFieldProps,
  DateFieldProps,
  MultiAsyncFieldProps,
  MultiSelectFieldProps,
  NumberFieldProps,
  SelectFieldProps,
  TextFieldProps,
} from "./props.js";
export { OutputBoundary, useOutputs } from "./outputs.js";
export { useRows } from "./rows.js";
export type {
  AsyncFieldProps,
  CheckboxFieldProps,
  DateFieldProps,
  MultiAsyncFieldProps,
  MultiSelectFieldProps,
  NumberFieldProps,
  OptionListProps,
  SelectFieldProps,
  TextFieldProps,
} from "./props.js";
export { queryLoader, type QueryClientLike } from "./query.js";
export {
  initialFromQuery,
  type InitialQuery,
  type QueryInitial,
  type FormEditor,
  type SessionOptions,
} from "./opening.js";

// The types of the public signatures stay in this module, unexported: the
// declarations of a consumer can expand them, but not name a module that the
// package does not export.
type Renderers = {
  text: ComponentType<TextFieldProps>;
  number: ComponentType<NumberFieldProps>;
  checkbox: ComponentType<CheckboxFieldProps>;
  select: ComponentType<SelectFieldProps>;
  async: ComponentType<AsyncFieldProps>;
  date: ComponentType<DateFieldProps>;
  multiSelect: ComponentType<MultiSelectFieldProps>;
  multiAsync: ComponentType<MultiAsyncFieldProps>;
};
// The presentation of a subtype declared as D, with any key where it says
// OptionKey: one renderer serves every endpoint. Required exactly when {}
// does not satisfy it.
type Keyed<T> = T extends OptionKey
  ? string
  : T extends readonly unknown[]
    ? { [I in keyof T]: Keyed<T[I]> }
    : T extends object
      ? { [P in keyof T]: Keyed<T[P]> }
      : T;
type Presented<O> = {} extends O
  ? { readonly presentation?: DeepReadonly<Keyed<O>> | undefined }
  : { readonly presentation: DeepReadonly<Keyed<O>> };
// What a field of the subtype N, declared as D, is in the forms of a binding.
type Shape<D, N> = D extends { readonly base: infer B; readonly presentation?: infer O }
  ? { readonly type: B; readonly subtype: N } & Presented<O>
  : never;
// The props of the renderer of a subtype: those of its base, whose options
// may have any metadata, and its presentation. A class component, which does
// not take narrower props, may take those of its base.
type AnyOption = Option & Readonly<Record<string, unknown>>;
type BaseProps = {
  [T in keyof Renderers]: T extends "async"
    ? AsyncFieldProps<AnyOption>
    : T extends "multiAsync"
      ? MultiAsyncFieldProps<AnyOption>
      : ComponentProps<Renderers[T]>;
};
type PropsOf<D> = D extends {
  readonly base: infer B extends keyof Renderers;
  readonly presentation?: infer O;
}
  ? BaseProps[B] & Presented<O>
  : never;
type SubtypeRenderer<D> = D extends { readonly base: infer B extends keyof Renderers }
  ? ComponentType<PropsOf<D>> | ComponentClass<ComponentProps<Renderers[B]>>
  : never;
// A renderer for some field types and some subtypes S; an undefined one
// registers nothing.
type Registry<S> = { readonly [T in keyof Renderers]?: Renderers[T] | undefined } & {
  readonly [N in keyof S]?: SubtypeRenderer<S[N]> | undefined;
};
type Unknown<R, S> = [keyof S] extends [never]
  ? Record<Exclude<keyof R, keyof Renderers>, never>
  : {
      readonly [K in Exclude<keyof R, keyof Renderers | keyof S>]: `"${K &
        string}" is neither a field type nor a subtype of forms`;
    };
// The field types and subtypes of a registry with a renderer.
type Registered<R> = Extract<
  { [K in keyof R]-?: undefined extends R[K] ? never : K }[keyof R],
  string
>;
// The field types whose definition declares a placeholder.
type PlaceholderType = {
  [T in FieldDefinition["type"]]: "placeholder" extends keyof Extract<FieldDefinition, { type: T }>
    ? T
    : never;
}[FieldDefinition["type"]];
// What Field renders: an element of the renderer of one registered field type.
type FieldElement<T extends keyof Renderers = keyof Renderers> = {
  [Q in T]: ReactElement<ComponentProps<Renderers[Q]>>;
}[T];
// The fields and the forms that the renderers of the keys R cover: a field of
// a subtype takes the renderer of its subtype, whose coverage useFormSession
// checks by name.
type SupportedFields<R> = Record<
  string,
  Extract<FieldDefinition, { type: R }> | Subtyped<Exclude<R, keyof Renderers>>
>;
type Subtyped<N> = [N] extends [never] ? never : FieldDefinition & { readonly subtype: N };
type Supported<R> = FormDefinition<
  SupportedFields<R>,
  Record<string, unknown>,
  unknown,
  Record<string, QueryState>,
  Record<string, { readonly fields: SupportedFields<R> }>
>;
// Field takes the fields of the base types of R without a subtype, and those
// of the subtypes of R with their shape in the forms S of the binding.
type StrictFields<R, S> = Record<
  string,
  | (Extract<FieldDefinition, { type: R }> & { readonly subtype?: never })
  | { [N in Extract<R, keyof S>]: FieldDefinition & Shape<S[N], N> }[Extract<R, keyof S>]
>;
type Strict<R, S> = FormDefinition<
  StrictFields<R, S>,
  Record<string, unknown>,
  unknown,
  Record<string, QueryState>,
  Record<string, { readonly fields: StrictFields<R, S> }>
>;
// useFormSession names each field of a subtype without a renderer in R, or
// of other forms than S.
type Verdict<M> = [M] extends [never] ? unknown : M;
type Missing<D, R, N extends string, S> = D extends { readonly subtype: infer T extends string }
  ? T extends keyof S
    ? D extends Shape<S[T], T>
      ? T extends R
        ? never
        : `Field "${N}" (subtype "${T}"): missing renderer`
      : `Field "${N}" (subtype "${T}") belongs to other forms`
    : [keyof S] extends [never]
      ? `Field "${N}" (subtype "${T}"): pass its forms to createReactBinding`
      : `Field "${N}" (subtype "${T}") belongs to other forms`
  : never;
// Each member of a union of sections, whose keyof keeps only the shared keys.
type FieldsMissing<F, R, S, Of extends string = ""> = F extends unknown
  ? { [N in keyof F]: Missing<F[N], R, `${N & string}${Of}`, S> }[keyof F]
  : never;
type FieldsOf<F> = F extends unknown ? F[keyof F] : never;
// Checked only when some field of the header or of a row has a subtype, in
// each member of a union of definitions.
type Coverage<D extends FormDefinition, R, S> = D extends unknown ? CoverageOf<D, R, S> : never;
type CoverageOf<D extends FormDefinition, R, S> = [
  FieldsOf<D["fields"]> | RowFieldsOf<D["collections"][keyof D["collections"]]>,
] extends [{ readonly type: string; readonly subtype?: undefined }]
  ? never
  :
      | FieldsMissing<D["fields"], R, S>
      | {
          [C in keyof D["collections"]]: FieldsMissing<
            RowFieldsIn<D["collections"][C]>,
            R,
            S,
            `" of "${C & string}`
          >;
        }[keyof D["collections"]];
type RowFieldsIn<C> = C extends { readonly fields: infer F } ? F : never;
type RowFieldsOf<C> = C extends { readonly fields: infer F } ? FieldsOf<F> : never;
// A Field renders a field of a session, as before rows existed, or of the
// handle of a row: each prop takes only its own kind of source.
type SessionFieldProps<D extends FormDefinition, K extends keyof D["fields"] & string> = {
  readonly session: Session<D>;
  readonly row?: never;
  readonly name: K;
  readonly label?: string | undefined;
  readonly placeholder?: D["fields"][K]["type"] extends PlaceholderType
    ? string | undefined
    : never;
};
type RowFieldProps<
  F extends Readonly<Record<string, FieldDefinition>>,
  J extends keyof F & string,
> = {
  readonly row: RowHandle<string, F>;
  readonly session?: never;
  readonly name: J;
  readonly label?: string | undefined;
  readonly placeholder?: F[J]["type"] extends PlaceholderType ? string | undefined : never;
};
// The Field of a binding whose renderers cover the field types and subtypes
// R, of the forms whose subtypes are S. Named, so a module that exports it
// emits a declaration that imports it from the package.
export interface FieldComponent<R extends string, S = {}> {
  <
    D extends Strict<R, S> = never,
    K extends keyof D["fields"] & string = never,
    F extends StrictFields<R, S> = never,
    J extends keyof F & string = never,
  >(
    props: SessionFieldProps<D, K> | RowFieldProps<F, J>,
  ): FieldElement<D["fields"][K]["type"] | F[J]["type"]> | null;
}
// The useFormSession of a binding whose renderers cover the field types and
// subtypes R: scope is required when the form has async fields.
export interface UseFormSession<R extends string, S = {}> {
  <D extends Supported<R>>(
    definition: D & NoInfer<Verdict<Coverage<D, R, S>>>,
    ...options: SessionArgument<D>
  ): FormEditor<D>;
}
// The props of the renderer of the subtype N of the forms F, to write it apart.
export type SubtypeProps<F, N extends string> = F extends {
  // oxlint-disable-next-line typescript/no-explicit-any -- Only any takes the field of any endpoints.
  readonly field: BoundField<any, infer S>;
}
  ? N extends keyof S
    ? PropsOf<S[N]>
    : never
  : never;

// The state of a scope that useFormState gives: the own errors its binding
// shows, with the external ones among them, the warnings, the counts and
// dirty, whole, and its marks.
type FormScope = Omit<Snapshot<FormDefinition>["form"], "collections" | "externalErrors">;
type CollectionScope = Omit<FormScope, "inputPending" | "attempted">;
type RowScope = Omit<
  RowSnapshot,
  "values" | "fieldStates" | "resetVersion" | "queries" | "externalErrors"
>;
type UseFormState = {
  <D extends FormDefinition>(session: Session<D>): FormScope;
  <D extends FormDefinition>(
    session: Session<D>,
    collection: keyof D["collections"] & string,
  ): CollectionScope;
  <
    N extends string,
    F extends Readonly<Record<string, FieldDefinition>>,
    Q extends Record<string, QueryState>,
  >(
    row: RowHandle<N, F, Q>,
  ): RowScope | undefined;
};

// The options of a binding: the loader of its sessions, direct by default,
// the forms whose subtypes its renderers cover, and when its renderers show
// the local errors: once touched, the default, or after the attempt. Its
// subtypes S are inferred from its field only.
export type BindingOptions<S = {}> = {
  readonly loader?: Loader | undefined;
  readonly showErrors?: "touched" | "attempted" | undefined;
  readonly forms?:
    | {
        // oxlint-disable-next-line typescript/no-explicit-any -- Only any takes the field of any endpoints.
        readonly field: BoundField<any, S>;
        readonly defineRules: (...config: never[]) => unknown;
      }
    | undefined;
};
export const createReactBinding = <const R extends Registry<NoInfer<S>>, S = {}>(
  registry: R & Unknown<R, S>,
  options?: BindingOptions<S>,
): {
  Field: FieldComponent<Registered<R>, S>;
  useFormSession: UseFormSession<Registered<R>, S>;
  useFormState: UseFormState;
} =>
  // TypeScript does not relate the checks at run time to the types of the
  // binding, so its members are cast.
  bind(registry, options) as never;
