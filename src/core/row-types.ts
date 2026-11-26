// The types of rows a session gives the application: keys, handles, snapshots
// of a row, and the values and keys of each collection.
import type { RowKey } from "./address.js";
import type { Fields, FieldsIn, FormDefinition, RowQueries } from "./definition.js";
import type { FieldDefinition, FieldValue, OptionOf, RemoteDefinition } from "./fields.js";
import type { OptionList } from "./lists.js";
import type { QueryState } from "./queries.js";
import type { FieldState } from "./states.js";
export type { RowKey } from "./address.js";

// The collections of a definition, and the fields of the rows of one.
export type CollectionName<D extends FormDefinition> = keyof D["collections"] & string;
export type RowFields<D extends FormDefinition, N extends CollectionName<D>> = FieldsIn<
  D["collections"][N]
>;
// The values of a row, as data, and the state of each of its fields.
export type RowValues<R extends Fields> = { -readonly [X in keyof R]: FieldValue<R[X]> };
export type RowStates<R extends Fields> = { readonly [X in keyof R]: FieldState<R[X]> };
// The fields of any row, and the states of its queries, which the wide handle
// takes by any name. They are not internal aliases: a default parameter is
// printed in the declarations of a consumer, which can name only exports.
type AnyFields = Record<string, FieldDefinition>;
type QueryStates = Readonly<Record<string, QueryState>>;
// A row as its handle reads it: the same object while its values, its states,
// the states of its queries and the reset version do not change. A row whose
// collection declares no queries always has the same {}.
export type RowSnapshot<R extends Fields = AnyFields, Q extends QueryStates = QueryStates> = {
  readonly values: Readonly<RowValues<R>>;
  readonly fieldStates: RowStates<R>;
  readonly resetVersion: number;
  readonly queries: Q;
  // The messages of the row alone, with the errors its sources give it apart,
  // how many of its destinations have some message, and whether the row is
  // new or a value in it changed.
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly dirty: boolean;
  // Whether the row existed at the last attempt of its session, and whether
  // the row or one of its cells was touched.
  readonly attempted: boolean;
  readonly touched: boolean;
};
// The remote fields of a row, those whose definition is remote in every member;
// none for the wide fields.
type RemoteIn<R extends Fields> = string extends keyof R
  ? never
  : { [X in keyof R]: R[X] extends RemoteDefinition ? X : never }[keyof R] & string;
// The option of each field of a row, which list looks up as Session.list does:
// a conditional return would not compare by structure.
type OptionsByField<R> = { readonly [X in keyof R]: OptionOf<R[X]> };
// The handle of a row of collection N, whose fields are R and the states of
// whose queries are Q: the same object while the row exists, checked on every
// call. getSnapshot is undefined while the row does not exist, and edit, list,
// retry and touch throw.
export type RowHandle<
  N extends string = string,
  R extends Fields = AnyFields,
  Q extends QueryStates = QueryStates,
> = {
  readonly collection: N;
  readonly key: RowKey<N>;
  readonly fields: R;
  getSnapshot(): RowSnapshot<R, Q> | undefined;
  subscribe(listener: () => void): () => void;
  edit<X extends keyof R & string>(name: X, value: FieldValue<R[X]>): void;
  // A new option list for one view of a remote field of the row, with the
  // params of the field in this row.
  list<X extends RemoteIn<R>>(name: X): OptionList<OptionsByField<R>[X]>;
  // A new request of the query of a field of the row, with its params in
  // force. The union is written here, so that generic code keeps it.
  retry(
    name:
      | (keyof Q & string)
      | ([keyof Q] extends [never] ? `collection "${N}" declares no queries` : never),
  ): void;
  // Marks a cell touched, and the row; without a name, the row alone.
  touch(name?: keyof R & string): void;
  // A controller for one view of a cell, as Session.input.
  input(name: keyof R & string): {
    error(message?: string | undefined): void;
    dispose(): void;
  };
};
export type RowHandleOf<D extends FormDefinition, N extends CollectionName<D>> = RowHandle<
  N,
  RowFields<D, N>,
  RowQueries<D, N>
>;
// The keys of the rows of each collection, in visual order.
export type FormRows<D extends FormDefinition> = {
  readonly [N in CollectionName<D>]: readonly RowKey<N>[];
};
// The values a session opens with: some fields of the header, and some rows of
// each collection, each with some of its fields.
export type FormInitial<D extends FormDefinition> = Flat<
  { readonly [K in keyof D["fields"]]?: FieldValue<D["fields"][K]> } & {
    readonly [N in CollectionName<D>]?: readonly NewRow<D, N>[];
  }
>;
type Flat<T> = { [K in keyof T]: T[K] };
// A row that add creates: some of its fields.
export type NewRow<D extends FormDefinition, N extends CollectionName<D>> = {
  readonly [X in keyof RowFields<D, N>]?: FieldValue<RowFields<D, N>[X]>;
};
// What a patch writes: some fields of the header and, nested by collection and
// key, some fields of rows. A field left undefined is not written.
export type FormPatch<D extends FormDefinition> = {
  readonly [K in keyof D["fields"]]?: FieldValue<D["fields"][K]> | undefined;
} & {
  readonly [N in CollectionName<D>]?:
    | {
        readonly [key: RowKey]:
          | {
              readonly [X in keyof RowFields<D, N>]?: FieldValue<RowFields<D, N>[X]> | undefined;
            }
          | undefined;
      }
    | undefined;
};
