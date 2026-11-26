import type { FieldDefinition, FieldValue } from "./fields.js";
import type { DeepReadonly, PlainRecord } from "./data.js";
import type { QueryState } from "./queries.js";
import type { RowValues } from "./row-types.js";
export {
  field,
  type TextDefinition,
  type NumberDefinition,
  type CheckboxDefinition,
  type SelectOption,
  type SelectDefinition,
  type AsyncDefinition,
  type DateDefinition,
  type MultiSelectDefinition,
  type MultiAsyncDefinition,
  type FieldDefinition,
  type FieldValue,
} from "./fields.js";

// C is the context the form declares, undefined when it declares none; the
// wide definition takes any. Q is the state of each query the rules declare:
// an entry whose query may be missing is optional. W is, for every collection
// of K, the state of each query its rows declare, {} for one without queries;
// every row has its own state of each one.
export type FormDefinition<
  F extends Record<string, FieldDefinition> = Record<string, FieldDefinition>,
  O extends Record<string, unknown> = Record<string, unknown>,
  C = unknown,
  Q extends Record<string, QueryState> = Record<string, QueryState>,
  K extends Collections = {},
  W extends CollectionQueries = CollectionQueries,
> = {
  readonly fields: F;
  readonly collections: K;
  readonly [outputValues]?: O;
  readonly [contextValue]?: C;
  readonly [queryStates]?: Q;
  readonly [rowQueryStates]?: W;
  // Only defineForm creates definitions; hand-written objects do not type-check.
  readonly [definitionBrand]: true;
};
declare const outputValues: unique symbol;
declare const contextValue: unique symbol;
declare const queryStates: unique symbol;
declare const rowQueryStates: unique symbol;
type CollectionQueries = Record<string, Readonly<Record<string, QueryState>>>;
// The queries of a definition: the state of each entry that declares one.
export type FormQueries<D extends FormDefinition> = D extends {
  readonly [queryStates]?: infer Q;
}
  ? Readonly<Q>
  : never;
// The queries of the rows of collection N: the state, in each row, of each
// entry of its each that declares one. An indexed access, not a conditional,
// so that generic code keeps it.
export type RowQueries<
  D extends FormDefinition,
  N extends keyof D["collections"] & string,
> = NonNullable<D[typeof rowQueryStates]>[N];
declare const definitionBrand: unique symbol;
// The context of a definition, undefined when it declares none. infer, unlike
// an indexed access, does not add undefined to an optional property.
export type FormContext<D extends FormDefinition> = D extends {
  readonly [contextValue]?: infer C;
}
  ? C
  : never;

// What declareContext<T>() declares: the context of a form, in types only.
declare const contextData: unique symbol;
export type ContextDeclaration<T> = { readonly [contextData]: T };
// The context is an object of plain data with some property: the empty type
// would take any value but null and undefined. An interface has no implicit
// index signature, so it does not fit: declare it with a type alias.
type ContextData<T> = [T] extends [PlainRecord]
  ? [keyof T] extends [never]
    ? "context data needs a property"
    : PlainRecord
  : "context data must be plain";
// Every declaration is the same frozen mark; its type carries T. Without a
// type argument T is the message itself, and the mark is refused.
type Declared<T> = [T] extends [never]
  ? "declareContext requires a type argument"
  : [T] extends [PlainRecord]
    ? ContextDeclaration<T>
    : "declareContext requires a type argument";
export const declaration = Object.freeze({});
export const declareContext = <T extends ContextData<T>>(): Declared<T> =>
  declaration as Declared<T>;
// The tools of every formula of a form that declares a context C also take
// it, read-only in depth; a form without context offers none.
export type ContextTools<C> = undefined extends C ? {} : { readonly context: DeepReadonly<C> };
export type FormOutputs<D extends FormDefinition> = DeepReadonly<
  NonNullable<D[typeof outputValues]>
>;
// The values of a form: each field of the header, and the rows of each
// collection as an array of their values. The wide definition has no
// collections. One flat type with no conditional on the definition, so that a
// form without collections keeps exactly its type, and a session of any form
// stays a session of the wide definition.
export type FormValues<D extends FormDefinition> = Flat<
  { -readonly [K in keyof D["fields"]]: FieldValue<D["fields"][K]> } & {
    -readonly [N in keyof D["collections"]]: RowValues<FieldsIn<D["collections"][N]>>[];
  }
>;
type Flat<T> = { -readonly [K in keyof T]: T[K] };
// The fields of the rows of a collection entry.
export type FieldsIn<E> = E extends { readonly fields: infer R extends Fields } ? R : never;
export type Fields = Record<string, FieldDefinition>;
// The collections of a form: the fields of the rows of each one.
export type Collections = Record<string, { readonly fields: Fields }>;
