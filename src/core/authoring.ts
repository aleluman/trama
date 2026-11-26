import type { HeaderRelation, RelationMessages } from "./authoring-relations.js";
import type { FieldValue, ParamsOf, RemoteDefinition, WithPlaceholder } from "./fields.js";
import type { ContextTools, Fields, FieldsIn } from "./definition.js";
import type { RowKey } from "./address.js";
import type {
  EditConflict,
  At,
  Checked,
  EmptyMessage,
  EmptyReason,
  EventMessages,
  Everywhere,
  Items,
  Keys,
  Lacks,
  Limit,
  LimitMessages,
  Member,
  Reported,
  Result,
  StateMessages,
  Verdict,
} from "./authoring-checks.js";
import type { CheckCollection, CollectionRules, RequiredEach, Row } from "./authoring-rows.js";
import type { Given } from "./rule-set-types.js";
import type { RemainingLayers } from "./authoring-params.js";
import type { QueryMessages, QueryRule } from "./authoring-values.js";

// Authoring by field properties: each entry of rules names a field and says what
// its properties are. A formula receives the values, where every name read is a
// dependency, and peek, which reads without creating one. An event receives the
// values as data and returns a patch for several fields. With a context C,
// every tool also takes it. K are the collections of the form, which the
// values hold as read-only arrays of rows.
type Flat<T> = { [P in keyof T]: T[P] };
export type Values<F extends Fields, K = {}> = Flat<
  { readonly [X in keyof F]: FieldValue<F[X]> } & {
    readonly [N in keyof K]: readonly Row<FieldsIn<K[N]>>[];
  }
>;
type Formula<F extends Fields, K, C, T> = (
  values: Values<F, K>,
  tools: { readonly peek: Values<F, K> } & ContextTools<C>,
) => T;
export type Many<T> = T | readonly T[];
// A reason is a non-empty string. Listing "" keeps a returned "" as a literal,
// so the checks below can reject it.
export type Reason = (string & {}) | "";
// Each formula of a state property, or each element of its array, is a
// contribution. true or a reason sets disabled and readOnly; false and
// undefined withdraw the contribution.
type Flag<F extends Fields, K, C> = Formula<F, K, C, boolean | Reason | undefined>;
type Toggle<F extends Fields, K, C> = Formula<F, K, C, boolean | undefined>;
// A message of error or warning, which false and undefined withdraw.
type Message<F extends Fields, K, C> = Formula<F, K, C, Reason | false | undefined>;
// A label or a placeholder; undefined withdraws, and "" is a text.
type Text<F extends Fields, K, C> = Formula<F, K, C, string | undefined>;
// A min or a max: a number or a date, as its field, or null, which suppresses
// the limits before it. Which one is checked where it is written.
export type Bound = number | string | null | undefined;
// What a states patch sets for one field; undefined withdraws.
type StateProperties<D> = {
  readonly disabled?: boolean | Reason | undefined;
  readonly readOnly?: boolean | Reason | undefined;
  readonly hidden?: boolean | undefined;
  readonly required?: boolean | Reason | undefined;
  readonly label?: string | undefined;
  readonly decimals?: number | undefined;
  readonly min?: Bound;
  readonly max?: Bound;
  readonly error?: Reason | false | undefined;
  readonly warning?: Reason | false | undefined;
} & (D extends WithPlaceholder ? { readonly placeholder?: string | undefined } : {});
export type StatePatch<F extends Fields> = {
  readonly [X in keyof F]?: StateProperties<F[X]> | undefined;
};
// A field missing from a patch, or undefined, is not written.
export type Patch<F extends Fields> = { readonly [X in keyof F]?: FieldValue<F[X]> | undefined };
// A patch of the form also writes rows of each collection, by key; there is no
// key for every row.
type FormPatch<F extends Fields, K> = Patch<F> & {
  readonly [N in keyof K]?:
    | { readonly [key: RowKey]: Patch<FieldsIn<K[N]>> | undefined }
    | undefined;
};
export type ToDefaults<F extends Fields> = <const N extends keyof F & string>(
  ...names: N[]
) => { readonly [P in N]: FieldValue<F[P]> };
// The keys of the rows of each collection, which an event reads without
// reading any value.
type Rows<K> = { readonly [N in keyof K]: readonly RowKey<N & string>[] };
type Event<F extends Fields, K, C> = (
  values: Values<F, K>,
  tools: {
    readonly toDefaults: ToDefaults<F>;
    readonly rows: Rows<K>;
    readonly before: Values<F, K>;
  } & ContextTools<C>,
) => FormPatch<F, K> | undefined;
// Whether the endpoint of a remote field requires params. A definition may be
// a union of remote definitions: its params are required when any member
// requires them.
type NeedsParams<D> = D extends RemoteDefinition ? ({} extends ParamsOf<D> ? never : true) : never;
type Entry<F extends Fields, K, C, X extends keyof F, M> = {
  readonly value?: Formula<F, K, C, FieldValue<F[X]> | undefined> | undefined;
  readonly disabled?: Many<Flag<F, K, C>> | undefined;
  readonly readOnly?: Many<Flag<F, K, C>> | undefined;
  readonly hidden?: Many<Toggle<F, K, C>> | undefined;
  readonly required?: Many<Flag<F, K, C>> | undefined;
  readonly error?: Many<Message<F, K, C>> | undefined;
  readonly warning?: Many<Message<F, K, C>> | undefined;
  readonly label?: Text<F, K, C> | undefined;
  readonly decimals?: Formula<F, K, C, number | undefined> | undefined;
  readonly min?: Formula<F, K, C, Bound> | undefined;
  readonly max?: Formula<F, K, C, Bound> | undefined;
  readonly states?: Formula<F, K, C, StatePatch<F> | undefined> | undefined;
  readonly onChange?: Event<F, K, C> | undefined;
  readonly relation?: HeaderRelation<F, K, C, X> | undefined;
  readonly onEdit?: Event<F, K, C> | undefined;
  readonly query?: QueryRule<F, K, C, M> | undefined;
} & (F[X] extends RemoteDefinition
  ? {
      // Every remote field has a placeholder: one conditional instead of two.
      // It goes first: after params, a wrong params formula made TypeScript
      // report the placeholder as referencing itself (TS7023).
      readonly placeholder?: Text<F, K, C> | undefined;
      // What the field sends to its endpoint; undefined suspends its lists.
      // Optional here: the required layer of FieldRules asks for it.
      readonly params?: Formula<F, K, C, ParamsOf<F[X]> | undefined> | undefined;
    }
  : F[X] extends WithPlaceholder
    ? { readonly placeholder?: Text<F, K, C> | undefined }
    : {});
// The remote fields whose params are required: their entry and its params are
// required too, and so is the collection of rows that have one.
export type RequiredEntries<F extends Fields> = {
  [X in keyof F]: F[X] extends RemoteDefinition
    ? [NeedsParams<F[X]>] extends [never]
      ? never
      : X
    : never;
}[keyof F];
// In rows, those of each member of a union of fields, and the collections
// that have one in each member of a union of sections. A name outside some
// member cannot be named in rules, so its form does not type-check.
export type RequiredRows<R> = R extends Fields ? RequiredEntries<R> : never;
export type RequiredCollections<K> = K extends unknown
  ? { [N in keyof K]-?: [RequiredRows<FieldsIn<K[N]>>] extends [never] ? never : N }[keyof K]
  : never;
// While defineForm infers its sections, K may stand for any collection: the
// rules of rows are then skipped, which would otherwise be instantiated for
// every field type in each form, also without collections. The required
// layers ask for params alone, as one function: a formula of state that
// reached the form through them would lose its context, so every other
// property is typed by the optional layer. I is include as written: without
// it, the form requires every params; with it, those its rule sets leave; and
// "set", the rules of a rule set, none.
type FieldRules<F extends Fields, K, C, M, I> = {
  readonly [X in keyof F]?: Entry<F, K, C, X, M> | undefined;
} & {
  readonly [N in keyof K as string extends N ? never : N]?:
    | CollectionRules<F, K, C, N, M>
    | undefined;
} & ([I] extends [undefined]
    ? RequiredLayers<F, K, C, M>
    : I extends "set"
      ? unknown
      : RemainingLayers<F, K, C, M, Given<I>>);
type RequiredLayers<F extends Fields, K, C, M> = ([RequiredEntries<F>] extends [never]
  ? unknown
  : {
      readonly [X in RequiredEntries<F>]: {
        readonly params: Formula<F, K, C, ParamsOf<F[X]> | undefined>;
      };
    }) &
  ([RequiredCollections<K>] extends [never]
    ? unknown
    : { readonly [N in RequiredCollections<K>]: RequiredEach<F, K, C, N & keyof K, M> });
type CheckProperty<F extends Fields, K, X extends keyof F, Q, V, M, E, P> = Q extends
  | "value"
  | "hidden"
  | "label"
  ? unknown
  : Q extends "disabled" | "readOnly"
    ? Reported<V, EmptyReason<Result<Items<V>>>>
    : Q extends "required" | "error" | "warning"
      ? Reported<V, EmptyMessage<Q, Result<Items<V>>>>
      : Q extends "placeholder"
        ? Verdict<Lacks<F, X, WithPlaceholder, "placeholder">>
        : Q extends Limit
          ? Verdict<LimitMessages<F, X, Q, Result<V>>>
          : Q extends "params"
            ? Verdict<Lacks<F, X, RemoteDefinition, "params">>
            : Q extends "states"
              ? Verdict<StateMessages<F, V>>
              : Q extends "onChange"
                ? Verdict<EventMessages<F, V, K>>
                : Q extends "onEdit"
                  ? Verdict<EventMessages<F, V, K> | EditConflict<E, `field "${X & string}"`>>
                  : Q extends "query"
                    ? Verdict<QueryMessages<F, X, V, M>>
                    : Q extends "relation"
                      ? Verdict<RelationMessages<F, X, P>>
                      : Everywhere<V, `rule property "${Q & string}" does not exist`>;
type CheckRules<F extends Fields, K, P, M> = {
  [X in Keys<P>]?: X extends keyof F
    ? [Extract<Member<P, X>, (...args: never) => unknown>] extends [never]
      ?
          | {
              [Q in Keys<Member<P, X>>]?: CheckProperty<
                F,
                K,
                X,
                Q,
                At<Member<P, X>, Q>,
                M,
                Member<P, X>,
                P
              >;
            }
          | undefined
      : `rules of field "${X & string}" must be an object of properties`
    : X extends keyof K
      ? CheckCollection<K, X, Member<P, X>, M> | undefined
      : `field "${X & string}" does not exist`;
};
// The rules defineForm accepts for fields F and collections K, where P is the
// section as written; defineForm infers it and adds it to this type. Every
// property is optional, so a function would also pass as an object.
// Functions inherit Symbol.hasInstance: this key rejects them, and its type is
// the message the error shows.
export type PropertyRules<F extends Fields, K, C, P, M, I = undefined> = FieldRules<F, K, C, M, I> &
  CheckRules<F, K, Checked<P>, M> & {
    readonly [Symbol.hasInstance]?: "rules must be an object keyed by field";
  };

export type { Formula };
export type { DefaultsRules } from "./authoring-values.js";
