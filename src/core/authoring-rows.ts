// Authoring the rules of the rows of a collection: rules.<collection>.each
// takes, per field of its rows, the same properties as an entry of the header.
// A rule of a row receives its row first, and then the values of the form, its
// key, never its position, and peek of both. params and query follow the
// registry M, as in the header, and a query writes only its own row.
import type { RowRelation, RelationMessages } from "./authoring-relations.js";
import type { FieldValue, ParamsOf, RemoteDefinition, WithPlaceholder } from "./fields.js";
import type { ContextTools, Fields, FieldsIn } from "./definition.js";
import type { RowKey } from "./address.js";
import type { PagedKey, ParamsIn, QueryKey, ResultIn } from "./endpoints.js";
import type {
  EditConflict,
  At,
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
import type {
  Bound,
  Formula,
  Many,
  Patch,
  Reason,
  RequiredRows,
  StatePatch,
  ToDefaults,
  Values,
} from "./authoring.js";
import type { Left } from "./authoring-params.js";
import type { Paged, QueryMessages } from "./authoring-values.js";
import type { NameOf } from "./rule-set-types.js";

// A row as rules read it.
export type Row<R extends Fields> = { readonly [X in keyof R]: FieldValue<R[X]> };
type Tools<F extends Fields, K, C, N> = {
  readonly values: Values<F, K>;
  readonly key: RowKey<N & string>;
} & ContextTools<C>;
export type RowFormula<F extends Fields, K, C, N extends keyof K, T> = (
  row: Row<FieldsIn<K[N]>>,
  tools: Tools<F, K, C, N> & {
    readonly peek: { readonly row: Row<FieldsIn<K[N]>>; readonly values: Values<F, K> };
  },
) => T;
// An event of a row writes its own row, by field name.
type RowEvent<F extends Fields, K, C, N extends keyof K> = (
  row: Row<FieldsIn<K[N]>>,
  tools: Tools<F, K, C, N> & {
    readonly toDefaults: ToDefaults<FieldsIn<K[N]>>;
    readonly before: { readonly row: Row<FieldsIn<K[N]>>; readonly values: Values<F, K> };
  },
) => Patch<FieldsIn<K[N]>> | undefined;
// The query of an entry of a row: its params are a formula of its row, and
// patch receives the result with its row, the values of the form, its key and
// the context, all as data, and writes fields of its own row. Without patch
// the result is written to the field of the entry, in its row.
type RowQueryPatch<F extends Fields, K, C, N extends keyof K, T> = (
  result: T,
  tools: { readonly row: Row<FieldsIn<K[N]>> } & Tools<F, K, C, N>,
) => Patch<FieldsIn<K[N]>> | undefined;
type RowQueryOf<F extends Fields, K, C, N extends keyof K, E extends string, T, P> = {
  readonly endpoint: E;
  readonly patch?: RowQueryPatch<F, K, C, N, T> | undefined;
  readonly forPrepare?: boolean | undefined;
} & ({} extends P
  ? { readonly params?: RowFormula<F, K, C, N, P | undefined> | undefined }
  : { readonly params: RowFormula<F, K, C, N, P | undefined> });
type RowQueryRule<F extends Fields, K, C, N extends keyof K, M> = [M] extends [undefined]
  ? unknown
  :
      | {
          [E in QueryKey<M>]: RowQueryOf<F, K, C, N, E, ResultIn<M[E]>, ParamsIn<M[E]>>;
        }[QueryKey<M>]
      | {
          [E in PagedKey<M>]: RowQueryOf<F, K, C, N, E, never, ParamsIn<M[E]>> & Paged<E>;
        }[PagedKey<M>];
type RowEntry<F extends Fields, K, C, N extends keyof K, X extends keyof FieldsIn<K[N]>, M> = {
  readonly value?: RowFormula<F, K, C, N, FieldValue<FieldsIn<K[N]>[X]> | undefined> | undefined;
  readonly disabled?: Many<RowFormula<F, K, C, N, boolean | Reason | undefined>> | undefined;
  readonly readOnly?: Many<RowFormula<F, K, C, N, boolean | Reason | undefined>> | undefined;
  readonly hidden?: Many<RowFormula<F, K, C, N, boolean | undefined>> | undefined;
  readonly required?: Many<RowFormula<F, K, C, N, boolean | Reason | undefined>> | undefined;
  readonly error?: Many<RowFormula<F, K, C, N, Reason | false | undefined>> | undefined;
  readonly warning?: Many<RowFormula<F, K, C, N, Reason | false | undefined>> | undefined;
  readonly label?: RowFormula<F, K, C, N, string | undefined> | undefined;
  readonly decimals?: RowFormula<F, K, C, N, number | undefined> | undefined;
  readonly min?: RowFormula<F, K, C, N, Bound> | undefined;
  readonly max?: RowFormula<F, K, C, N, Bound> | undefined;
  readonly states?: RowFormula<F, K, C, N, StatePatch<FieldsIn<K[N]>> | undefined> | undefined;
  readonly onChange?: RowEvent<F, K, C, N> | undefined;
  readonly relation?: RowRelation<F, K, C, N, X> | undefined;
  readonly onEdit?: RowEvent<F, K, C, N> | undefined;
  readonly query?: RowQueryRule<F, K, C, N, M> | undefined;
} & (FieldsIn<K[N]>[X] extends RemoteDefinition
  ? {
      // The placeholder goes first, as in the header.
      readonly placeholder?: RowFormula<F, K, C, N, string | undefined> | undefined;
      // What the lists of its views send, read with the tools of a formula
      // of its row; undefined suspends them. Optional here, as in the header:
      // the form requires them in RequiredEach.
      readonly params?: RowFormula<F, K, C, N, ParamsOf<FieldsIn<K[N]>[X]> | undefined> | undefined;
    }
  : FieldsIn<K[N]>[X] extends WithPlaceholder
    ? { readonly placeholder?: RowFormula<F, K, C, N, string | undefined> | undefined }
    : {});
// The rules of the rows of collection N, for a header F, collections K, a
// context C and a registry M, undefined for the core, which a set of rules
// defined apart could infer as well. Every entry is optional here: those a
// form requires, of the async fields whose params are required, are a layer
// of its rules, so that a set of rules may leave them to another one.
export type EachRules<F extends Fields, K, C, N extends keyof K, M> = {
  readonly [X in keyof FieldsIn<K[N]>]?: RowEntry<F, K, C, N, X, M> | undefined;
};
// The messages of each row, which read its values as the rules of its fields
// do, and those of the collection, which read the header.
type Messages<T> = {
  readonly error?: Many<T> | undefined;
  readonly warning?: Many<T> | undefined;
};
export type CollectionRules<F extends Fields, K, C, N extends keyof K, M> = {
  readonly each?: EachRules<F, K, C, N, M> | undefined;
  readonly row?: Messages<RowFormula<F, K, C, N, Reason | false | undefined>> | undefined;
  readonly collection?: Messages<Formula<F, K, C, Reason | false | undefined>> | undefined;
};
// The entries of the rows of collection N that a form requires, with their
// params alone, as one function: a formula of state that reached the form
// through this layer would lose its context. A field that is async in some
// member of a union of collections and not in another takes no params here,
// as its entry does not. _M, the registry, stays in the type that messages
// print.
export type RequiredEach<F extends Fields, K, C, N extends keyof K, _M> = {
  readonly each: {
    readonly [X in RequiredRows<FieldsIn<K[N]>>]: FieldsIn<K[N]>[X &
      keyof FieldsIn<K[N]>] extends RemoteDefinition
      ? {
          readonly params: RowFormula<
            F,
            K,
            C,
            N,
            ParamsOf<FieldsIn<K[N]>[X & keyof FieldsIn<K[N]>]> | undefined
          >;
        }
      : {};
  };
};

// Those that the rule sets of the form leave: G are the params they surely
// give.
export type RemainingEach<F extends Fields, K, C, N extends keyof K, M, G> = {
  readonly each: {
    readonly [
      X in keyof RequiredEach<F, K, C, N, M>["each"] as Left<X, G, ["rows", NameOf<N>]>
    ]: RequiredEach<F, K, C, N, M>["each"][X];
  };
};

// The rules of a collection as written: each, whose names are fields of its
// rows, and the properties of each entry, whose messages name the field and
// the collection; and the messages of its rows and of itself.
export type CheckCollection<K, N extends keyof K, V, M> = [
  Extract<V, (...args: never) => unknown>,
] extends [never]
  ? {
      [Q in Keys<V>]?: Q extends "each"
        ? CheckEach<FieldsIn<K[N]>, ` of "${N & string}"`, Member<V, Q>, M> | undefined
        : Q extends "row" | "collection"
          ? CheckMessages<Member<V, Q>, `${Q} rules of "${N & string}"`> | undefined
          : Everywhere<
              At<V, Q>,
              `rules of collection "${N & string}" take each, row or collection`
            >;
    }
  : `rules of collection "${N & string}" must be an object with each, row or collection`;
// The messages of a scope as written: error and warning, without "".
export type CheckMessages<V, What extends string> = {
  [Q in Keys<V>]?: Q extends "error" | "warning"
    ? Reported<At<V, Q>, EmptyMessage<Q, Result<Items<At<V, Q>>>>>
    : Everywhere<At<V, Q>, `${What} take error or warning`>;
};
type CheckEach<R extends Fields, Of extends string, E, M> = {
  [X in Keys<E>]?: X extends keyof R
    ? [Extract<Member<E, X>, (...args: never) => unknown>] extends [never]
      ?
          | {
              [Q in Keys<Member<E, X>>]?: CheckRowProperty<
                R,
                Of,
                X,
                Q,
                At<Member<E, X>, Q>,
                M,
                Member<E, X>,
                E
              >;
            }
          | undefined
      : `rules of field "${X & string}"${Of} must be an object of properties`
    : `field "${X & string}"${Of} does not exist`;
};
type CheckRowProperty<
  R extends Fields,
  Of extends string,
  X extends keyof R,
  Q,
  V,
  M,
  E,
  P,
> = Q extends "value" | "hidden" | "label"
  ? unknown
  : Q extends "disabled" | "readOnly"
    ? Reported<V, EmptyReason<Result<Items<V>>>>
    : Q extends "required" | "error" | "warning"
      ? Reported<V, EmptyMessage<Q, Result<Items<V>>>>
      : Q extends "placeholder"
        ? Verdict<Lacks<R, X, WithPlaceholder, "placeholder", Of>>
        : Q extends Limit
          ? Verdict<LimitMessages<R, X, Q, Result<V>, Of>>
          : Q extends "params"
            ? Verdict<Lacks<R, X, RemoteDefinition, "params", Of>>
            : Q extends "states"
              ? Verdict<StateMessages<R, V, Of>>
              : Q extends "onChange"
                ? Verdict<EventMessages<R, V, {}, Of>>
                : Q extends "onEdit"
                  ? Verdict<
                      EventMessages<R, V, {}, Of> | EditConflict<E, `field "${X & string}"${Of}`>
                    >
                  : Q extends "query"
                    ? Verdict<QueryMessages<R, X, V, M, Of>>
                    : Q extends "relation"
                      ? Verdict<RelationMessages<R, X, P, Of>>
                      : Everywhere<V, `rule property "${Q & string}" does not exist`>;
