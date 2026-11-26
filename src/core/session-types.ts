// The types of a session: its snapshot and its members.
import type { FormDefinition, FormOutputs, FormQueries, FormValues } from "./definition.js";
import type { FieldValue, OptionOf, RemoteDefinition } from "./fields.js";
import type { OptionList } from "./lists.js";
import type { FieldsOf } from "./options.js";
import type { FieldStates } from "./states.js";
import type {
  CollectionName,
  FormPatch,
  FormRows,
  NewRow,
  RowFields,
  RowHandleOf,
  RowKey,
} from "./row-types.js";
import type { Checked, Items, Keys, NestedMessages, Unknown, Verdict } from "./authoring-checks.js";

// The names a patch of the session writes that its form lacks.
type PatchMessages<D extends FormDefinition, P> =
  | Unknown<"patch field", Exclude<Keys<P>, keyof D["fields"] | keyof D["collections"]>>
  | NestedMessages<D["collections"], P>;
// The names the rows of an add write that the rows of collection N lack.
type AddMessages<D extends FormDefinition, N extends CollectionName<D>, T> = Unknown<
  "add field",
  Exclude<Keys<Items<T>>, keyof RowFields<D, N>>,
  ` of "${N}"`
>;

// A message and where it is: the form, a field of the header, a collection, a
// row of it, by its key, or a field of that row. With a definition, its names
// are those of the definition, as setErrors takes them; without one, as
// prepare gives them, they are any. The intersection keeps the name of the
// type in the declarations of a consumer.
export type Issue<D extends FormDefinition = FormDefinition> = {
  readonly message: string;
} & (FormDefinition extends D ? AnyPlace : PlaceOf<D>);
type AnyPlace = {
  readonly field?: string | undefined;
  readonly collection?: string | undefined;
  readonly key?: RowKey | undefined;
};
type Absent<K extends string> = { readonly [P in K]?: undefined };
type PlaceOf<D extends FormDefinition> =
  | Absent<"field" | "collection" | "key">
  | ({ readonly field: keyof D["fields"] & string } & Absent<"collection" | "key">)
  | {
      [N in CollectionName<D>]:
        | ({ readonly collection: N } & Absent<"field" | "key">)
        | {
            readonly collection: N;
            // An index past the rows of a prepared gives no key.
            readonly key: RowKey<N> | undefined;
            readonly field?: (keyof RowFields<D, N> & string) | undefined;
          };
    }[CollectionName<D>];
// The properties of the issues of a list that an issue lacks.
type IssueMessages<I> = Unknown<
  "issue property",
  Exclude<Keys<Items<I>>, "message" | "field" | "collection" | "key">
>;

// The messages of a scope, those of the scope alone: its errors, those its
// sources give it from outside the rules, apart, and its warnings, local and
// external; how many destinations in it have some message, local or
// external; and whether a value in it differs from the baseline.
type ScopeState = {
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly dirty: boolean;
};
// The state of the form, with that of each collection, whether a prepare
// marked the attempt since opening or reset, and whether a view reports a
// text it could not convert.
type FormState<D extends FormDefinition> = ScopeState & {
  readonly attempted: boolean;
  readonly inputPending: boolean;
  readonly collections: { readonly [N in keyof D["collections"]]: ScopeState };
};
export type Snapshot<D extends FormDefinition> = {
  readonly values: Readonly<FormValues<D>>;
  // The messages, the counts and dirty of the form and of its collections.
  readonly form: FormState<D>;
  readonly fieldStates: FieldStates<D>;
  // The keys of the rows of each collection, in visual order; each array keeps
  // its identity while the rows of its collection and their order do not change.
  readonly rows: FormRows<D>;
  readonly resetVersion: number;
  // The state of each query; it keeps its identity while none changes.
  readonly queries: FormQueries<D>;
};
// The remote fields of a definition, those whose definition is remote in every
// member; none for the wide FormDefinition.
type RemoteNames<D extends FormDefinition> = string extends keyof FieldsOf<D>
  ? never
  : {
      [K in keyof FieldsOf<D>]: FieldsOf<D>[K] extends RemoteDefinition ? K : never;
    }[keyof FieldsOf<D>] &
      string;
// The option of each field. A method that returns a conditional type does not
// compare by structure, so list looks its option up in this map; a union of
// names still gives one list of the union of their options.
type OptionsByField<F> = { readonly [K in keyof F]: OptionOf<F[K]> };
// What prepare gives when it is ready: the values and the keys of the rows it
// captured, and the warnings then. Only prepare gives one: its mark is not
// exported.
declare const prepared: unique symbol;
export type Prepared<D extends FormDefinition = FormDefinition> = {
  readonly status: "ready";
  readonly values: Readonly<FormValues<D>>;
  readonly rows: FormRows<D>;
  readonly warnings: readonly Issue[];
  readonly [prepared]: true;
};
type PrepareResult<D extends FormDefinition> =
  | Prepared<D>
  | { readonly status: "invalid"; readonly issues: readonly Issue[] }
  | { readonly status: "cancelled" };
// Covariant: two sessions written as Session<…> compare their definitions, not
// each of their members.
export type Session<out D extends FormDefinition> = {
  readonly definition: D;
  // A new option list for one view of a remote field.
  list<K extends RemoteNames<D>>(name: K): OptionList<OptionsByField<FieldsOf<D>>[K]>;
  getSnapshot(): Snapshot<D>;
  subscribe(listener: () => void): () => void;
  watchOutputs(
    callback: (outputs: FormOutputs<D>) => void,
    options?: { onError?: ((error: unknown) => void) | undefined },
  ): () => void;
  edit<K extends keyof D["fields"] & string>(name: K, value: FieldValue<D["fields"][K]>): void;
  reset(): void;
  // The handle of a row, the same object while the row exists.
  row<N extends CollectionName<D>>(collection: N, key: RowKey<NoInfer<N>>): RowHandleOf<D, N>;
  // Adds rows at a position, at the end by default, and returns their keys. T
  // is the rows as written, whose names are checked again.
  add<N extends CollectionName<D>, const T extends readonly NewRow<D, N>[]>(
    collection: N,
    rows: T & Verdict<AddMessages<D, N, Checked<T>>>,
    options?: { readonly at?: number | undefined },
  ): { readonly [I in keyof T]: RowKey<N> };
  remove<N extends CollectionName<D>>(collection: N, keys: readonly RowKey<NoInfer<N>>[]): void;
  move<N extends CollectionName<D>>(collection: N, key: RowKey<NoInfer<N>>, to: number): void;
  // Writes fields of the header and of rows, nested by collection and key, as
  // an edit of all of them. P is the patch as written, whose names are checked
  // again, also inside Object.fromEntries.
  patch<const P extends FormPatch<D>>(patch: P & Verdict<PatchMessages<D, Checked<P>>>): void;
  // A new request of the query of an entry, with the params in force.
  retry(name: keyof FormQueries<D> & string): void;
  // Marks a field of the header touched: its state publishes touched.
  touch(name: keyof D["fields"] & string): void;
  // A controller for one view of a field of the header, which reports the
  // text it could not convert as an error of the field until it withdraws it.
  input(name: keyof D["fields"] & string): {
    error(message?: string | undefined): void;
    dispose(): void;
  };
  // Replaces the errors, or the warnings, that a source gives from outside
  // the rules, as the response of a server: each message with where it is.
  // They show always, do not block prepare, and leave when their destination
  // changes. With from, the prepared that was sent, the destinations that
  // changed after preparing are left out; false, without replacing, when it
  // is older than a reset, than a later commit or than the one that last
  // wrote the source.
  // I is the list as written, whose properties are checked again.
  setErrors<const I extends readonly Issue<D>[]>(
    source: string,
    issues: I & Verdict<IssueMessages<Checked<I>>>,
    options?: { readonly from?: Prepared<D> | undefined },
  ): boolean;
  setWarnings<const I extends readonly Issue<D>[]>(
    source: string,
    issues: I & Verdict<IssueMessages<Checked<I>>>,
    options?: { readonly from?: Prepared<D> | undefined },
  ): boolean;
  // Marks the attempt, waits for the queries forPrepare and captures the
  // values, or the problems in visual order. Another prepare, a change of
  // values or rows, a reset or the signal cancel it.
  prepare(options?: { readonly signal?: AbortSignal | undefined }): Promise<PrepareResult<D>>;
  // Accepts a prepared: the baseline becomes it with the canonical values, a
  // patch of its rows, and the values in force take them where nothing
  // changed after preparing. False when it is older than a reset or than the
  // last one accepted.
  commit<const P extends FormPatch<D>>(
    prepared: Prepared<D>,
    canonical?: P & Verdict<PatchMessages<D, Checked<P>>>,
  ): boolean;
};
