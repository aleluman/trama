// Rule sets in types: what a set carries, what a form that includes it must
// have, and what the sets of include give where they meet: their queries and
// the params they surely give.
import type { FieldsIn } from "./definition.js";
import type { FieldDefinition, FieldValue } from "./fields.js";
import type { Keys, Verdict } from "./authoring-checks.js";
import type { SinglesOf } from "./rule-set-config.js";
import type { StatesOf } from "./config.js";

declare const ruleSet: unique symbol;
// A set of rules, as one record T of named parts: what it requires of a form,
// its fields, collections and context; the state of its queries and of those
// of its rows; the properties it declares that a form takes once, and the
// params it surely gives; and whether it belongs to a createForms. Invariant,
// so that TypeScript does not reduce a conditional between two sets to one of
// them. RuleSet alone is any set, which only defineForm checks, when it runs.
// A plain alias, so that declarations print it by name: a conditional one
// would resolve to the object and name its private key.
// oxlint-disable-next-line typescript/no-explicit-any -- Only any takes every set of an invariant record.
export type RuleSet<T = any> = { readonly [ruleSet]: (parts: T) => T };
type AnySet = { readonly [ruleSet]: (parts: never) => unknown };
type PartsOf<E> = E extends { readonly [ruleSet]: (parts: infer T) => unknown }
  ? [T] extends [never]
    ? Unchecked
    : 0 extends 1 & T
      ? Unchecked
      : T & Parts
  : never;
type Absent = false | null | undefined;
export type Includable = AnySet | Absent;
type Parts = { readonly [Key in keyof Unchecked]: unknown };
// What the wide RuleSet carries: it requires and gives nothing in types.
type Unchecked = {
  readonly fields: {};
  readonly collections: {};
  readonly context: undefined;
  readonly queries: {};
  readonly rowQueries: {};
  readonly declares: never;
  readonly gives: never;
  readonly bound: false;
};
// Part Key of each member of E on its own, never of an absent one: inferring
// from a union of sets would reduce it by subtypes.
export type Part<E, Key extends keyof Parts> = E extends AnySet ? PartsOf<E>[Key] : never;

// What a set requires of the form that includes it. Of a field, its type, its
// value and, of an async field, its endpoint; its label and default belong to
// the form.
type TypeOf<D> = D extends { readonly type: infer T } ? T : never;
type EndpointOf<D> = D extends { readonly endpoint: infer E } ? E : never;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type ValueOf<D> = D extends FieldDefinition ? FieldValue<D> : never;
type Fits<A, B> = [Same<TypeOf<A>, TypeOf<B>>, Same<EndpointOf<A>, EndpointOf<B>>] extends [
  true,
  true,
]
  ? Same<ValueOf<A>, ValueOf<B>>
  : false;
// A name of a field or a collection as text: a key written as a number, such
// as [-1], names "-1", as at runtime. Named is the entry of T with the name of
// X, written either way.
export type NameOf<X> = `${X & (string | number)}`;
type Named<T, X> = X extends keyof T
  ? T[X]
  : { [Y in keyof T]: NameOf<Y> extends NameOf<X> ? T[Y] : never }[keyof T];
type FieldNeeds<F, S, Of extends string> = {
  [X in keyof S]: Named<F, X> extends infer D
    ? [D] extends [never]
      ? `rule set requires field "${NameOf<X>}"${Of}`
      : Fits<D, S[X]> extends true
        ? never
        : `rule set requires field "${NameOf<X>}"${Of} of another type`
    : never;
}[keyof S];
type CollectionNeeds<K, S> = {
  [N in keyof S]: Named<K, N> extends infer R
    ? [R] extends [never]
      ? `rule set requires collection "${NameOf<N>}"`
      : FieldNeeds<FieldsIn<R>, FieldsIn<S[N]>, ` of "${NameOf<N>}"`>
    : never;
}[keyof S];
// A wider context of the form fits.
type ContextNeeds<C, S> = undefined extends S
  ? never
  : [C] extends [S]
    ? never
    : "rule set requires another context";
// A set of createForms enters only the forms of createForms.
type RegistryNeeds<M, B> = [M] extends [undefined]
  ? B extends true
    ? "rule set of createForms: define the form with the defineForm of createForms"
    : never
  : never;
type Needs<F, K, C, M, E> = E extends AnySet
  ? PartsOf<E> extends infer T extends Parts
    ?
        | FieldNeeds<F, T["fields"], "">
        | CollectionNeeds<K, T["collections"]>
        | ContextNeeds<C, T["context"]>
        | RegistryNeeds<M, T["bound"]>
    : never
  : never;

// A property declared by two sets, or by a set and the rules of the form. The
// properties are ["header", field, property] or ["rows", collection, field,
// property], so that no name of a field reads as one of a row; messages name
// the field of a key as field "total" or field "lot" of "lines".
export type FieldName<X> = X extends readonly ["header", infer N extends string, ...unknown[]]
  ? `field "${N}"`
  : X extends readonly ["rows", infer C extends string, infer N extends string, ...unknown[]]
    ? `field "${N}" of "${C}"`
    : never;
type Label<X> = X extends readonly [...unknown[], infer P extends string]
  ? `${FieldName<X>} ${P}`
  : never;
type Twice<S, Elsewhere, Inline> =
  | (Extract<S, Elsewhere> extends infer X ? `${Label<X>} is declared by another rule set` : never)
  | (Extract<S, Inline> extends infer X ? `${Label<X>} is declared in rules too` : never);
// The properties of the other elements of a list of known length.
type Others<I extends readonly unknown[], J> = {
  [L in keyof I]: L extends J ? never : Part<I[L], "declares">;
}[number];
// Each element of a list of known length is checked as a whole: what it
// requires and what it declares again; a list of unknown length, also as a
// whole, against the rules of the form. P are the rules as written.
export type IncludeChecks<F, K, C, M, I, P> = I extends readonly unknown[]
  ? number extends I["length"]
    ? LooseChecks<
        Needs<F, K, C, M, I[number]> | Twice<Part<I[number], "declares">, never, SinglesOf<P, K>>
      >
    : ElementChecks<F, K, C, M, I, SinglesOf<P, K>>
  : I;
type LooseChecks<M> = [M] extends [never] ? unknown : readonly M[];
type ElementChecks<F, K, C, M, I extends readonly unknown[], Inline> = {
  readonly [J in keyof I]: Verdict<
    Needs<F, K, C, M, I[J]> | Twice<Part<I[J], "declares">, Others<I, J>, Inline>
  >;
};

// What the sets give where they meet. An element that may be absent gives
// nothing surely, and neither does the rest of a list of unknown length or a
// section that may be undefined. A section that is one of several lists gives
// surely what every list does. J is the key of an element: a numeric string
// for one at a fixed place, and number for the rest of a list.
type SureAt<I, J, E> = [undefined] extends [I]
  ? false
  : J extends `${number}`
    ? [Extract<E, Absent>] extends [never]
      ? true
      : false
    : false;
type RowsIn<E, N> =
  Part<E, "rowQueries"> extends infer W
    ? W extends unknown
      ? N extends keyof W
        ? W[N]
        : {}
      : never
    : never;
export type Lists<I> =
  NonNullable<I> extends infer L ? (L extends readonly unknown[] ? L : never) : never;
// The keys of the states that no member of T lacks.
type RequiredQueryKeys<T> = T extends unknown
  ? { [X in keyof T]-?: {} extends Pick<T, X> ? never : X }[keyof T]
  : never;
// The states of the queries of a set: those of the header, or, with N, those
// of the rows of collection N; and what a set surely gives: the keys of those
// states that are not optional or, with Gives, its params.
type QueriesAt<E, N> = [N] extends [never] ? Part<E, "queries"> : RowsIn<E, N>;
type SureOf<E, N, Gives> = Gives extends true
  ? Part<E, "gives">
  : RequiredQueryKeys<QueriesAt<E, N>>;
// An alternative gives surely only what all of its members do.
type InEvery<E, N, Gives, X = SureOf<E, N, Gives>> = X extends unknown
  ? [E extends unknown ? (X extends SureOf<E, N, Gives> ? never : X) : never] extends [never]
    ? X
    : never
  : never;
// What each element of the list L gives. Each helper maps over L itself, so
// that a tuple maps element by element.
type AllIn<L extends readonly unknown[], N> = { [J in keyof L]: Keys<QueriesAt<L[J], N>> }[number];
type SureIn<L extends readonly unknown[], I, N, Gives> = {
  [J in keyof L]: SureAt<I, J, L[J]> extends true ? InEvery<L[J], N, Gives> : never;
}[number];
type AnyList<Ls, N> = Ls extends readonly unknown[] ? AllIn<Ls, N> : never;
type SureList<Ls, I, N, Gives> = Ls extends readonly unknown[] ? SureIn<Ls, I, N, Gives> : never;
type EveryList<I, N, Gives, Ls = Lists<I>, X = SureList<Ls, I, N, Gives>> = X extends unknown
  ? [
      Ls extends readonly unknown[] ? (X extends SureIn<Ls, I, N, Gives> ? never : X) : never,
    ] extends [never]
    ? X
    : never
  : never;
export type IncludedQueries<I> = [I] extends [undefined]
  ? {}
  : StatesOf<AnyList<Lists<I>, never>, EveryList<I, never, false>>;
export type IncludedRowQueries<I, N> = StatesOf<AnyList<Lists<I>, N>, EveryList<I, N, false>>;
// The params the sets surely give, as ["header", field] or ["rows",
// collection, field].
export type Given<I> = [I] extends [undefined] ? never : EveryList<I, never, true>;
