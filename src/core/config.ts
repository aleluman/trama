// The configuration defineForm takes, in types: its sections, inferred as
// written so that their names are checked again, and the definition it returns.
import type { CoreDefinition, RemoteDefinition } from "./fields.js";
import type { RemoteFieldOf } from "./endpoints.js";
import type { OutputTools, OutputReferences } from "./outputs.js";
import type {
  DefaultsRules,
  PropertyRules,
  RequiredCollections,
  RequiredEntries,
} from "./authoring.js";
import type { Keys, Verdict } from "./authoring-checks.js";
import type { FormRules } from "./authoring-form.js";
import type { QueryState } from "./queries.js";
import type {
  IncludeChecks,
  Includable,
  IncludedQueries,
  IncludedRowQueries,
} from "./rule-set-types.js";
import type { ParamsLeftRules } from "./authoring-params.js";
import type {
  Collections,
  ContextDeclaration,
  Fields,
  FieldsIn,
  FormDefinition,
} from "./definition.js";

// Property Key of entry X in each member of the rules P as written, and
// undefined where the rules, the entry or the property may be missing.
export type PropertyIn<P, X, Key extends string> = P extends unknown
  ? X extends keyof P
    ? PropertyOf<P[X], Key>
    : undefined
  : never;
type PropertyOf<E, Key extends string> = E extends object
  ? Key extends keyof E
    ? E[Key]
    : undefined
  : undefined;
type QueryIn<P, K> = PropertyIn<P, K, "query">;
// The entries that declare a query in some member, and those that surely do.
type QueryNames<P> = {
  [K in Keys<P>]: [NonNullable<QueryIn<P, K>>] extends [never] ? never : K;
}[Keys<P>];
type SureNames<P> = {
  [K in QueryNames<P>]: undefined extends QueryIn<P, K> ? never : K;
}[QueryNames<P>];
// The state of each query of All, optional unless Sure.
export type StatesOf<All, Sure> = { readonly [K in Sure & PropertyKey]: QueryState } & {
  readonly [K in Exclude<All, Sure> & PropertyKey]?: QueryState;
};
// One anonymous object type, so that messages and declarations show the names
// instead of the rules or an alias.
export type QueriesOf<P> = [QueryNames<P>] extends [never]
  ? {}
  : StatesOf<QueryNames<P>, SureNames<P>> extends infer T
    ? { [K in keyof T]: T[K] }
    : never;
// The each of collection N in each member of the rules P as written, and
// undefined where the rules, the collection or its each may be missing: the
// queries of the rows of N are those of a section of rules. Every collection
// of K has its own, {} without queries.
export type EachIn<P, N> = PropertyIn<P, N, "each">;
export type RowQueriesOf<P, K> = [keyof K] extends [never]
  ? {}
  : { readonly [N in keyof K]: QueriesOf<EachIn<P, N>> };
// The entries of the header or of the rows that declare a query; a
// collection that some member of a union of sections lacks declares none.
type AnyQuery<P, K> = QueryNames<P> | { [N in keyof K]-?: QueryNames<EachIn<P, N>> }[keyof K];

// The names of the outputs are part of the definition's type, so a section of
// outputs that may be undefined declares none.
type NoOutputs<O> = {} extends O ? undefined : never;
// So is the context: a section that may be undefined declares none.
export type NoContext<C> = undefined extends C ? undefined : never;
// And so are the queries: rules that may be undefined declare none.
type NoQueries<P, K> = [AnyQuery<P, K>] extends [never] ? undefined : never;
// collections: undefined infers K as undefined, and declares none.
export type Declared<K> = [K] extends [Collections] ? K : {};
// The rows of every collection are always in the snapshot, so a section of
// collections that may be undefined declares none.
type CollectionsPresent<K> = [keyof K] extends [never] ? unknown : { readonly collections: K };
// Rules are required by the remote fields whose params are, also in rows, and
// present when they declare queries, whose states must then exist. With rule
// sets, by the params they leave, and the key rules lack says why.
type Needs<N, T> = [N] extends [never] ? unknown : { readonly rules: T };
type RulesRequired<F extends Fields, K, P, I> = ([I] extends [undefined]
  ? Needs<RequiredEntries<F> | RequiredCollections<K>, object>
  : ParamsLeftRules<F, K, I>) &
  Needs<AnyQuery<P, K>, unknown>;
// P and L infer the rules and form sections as written, from their own site:
// behind a union with undefined or a mapped type, TypeScript would infer each
// member of a union of sections on its own and keep their common supertype.
// C is inferred from the mark of context only; X infers defaults as written,
// as P and L, so that its fields are checked again. K infers the collections.
type FormConfig<F extends Fields, O extends Record<string, unknown>, P, L, C, X, M, K, I> = {
  readonly fields: F;
  readonly collections?: K | undefined;
  readonly context?: ContextDeclaration<C> | NoContext<C>;
  readonly defaults?: DefaultsRules<NoInfer<F>, NoInfer<C>, X> | undefined;
  readonly rules?:
    | PropertyRules<NoInfer<F>, NoInfer<Declared<K>>, NoInfer<C>, P, M, I>
    | NoQueries<P, NoInfer<Declared<K>>>;
  readonly form?: FormRules<NoInfer<F>, NoInfer<Declared<K>>, NoInfer<C>, L> | undefined;
  readonly outputs?:
    | (<Owner>(
        tools: OutputTools<NoInfer<F>, NoInfer<C>, Owner, NoInfer<Declared<K>>>,
      ) => OutputReferences<O, Owner>)
    | NoOutputs<O>;
} & {
  readonly rules?: P | undefined;
  readonly form?: L | undefined;
  readonly defaults?: X | undefined;
} & RulesRequired<NoInfer<F>, NoInfer<Declared<K>>, NoInfer<P>, I> &
  CollectionsPresent<NoInfer<Declared<K>>>;
// A defineForm or a defineRules accepts the field types Allowed. The one of
// the core, whose registry M is undefined, rejects remote fields, subtypes and
// queries; the one of createForms, the remote fields of another registry and
// the subtypes of other forms. The message is the type the field should have,
// and sends each owner to its function.
type Rejection<Label extends string, D, Bound, Owner> = D extends {
  readonly subtype: infer N extends string;
}
  ? Bound extends true
    ? `${Label} (subtype "${N}") belongs to other forms`
    : `${Label} (subtype "${N}"): ${Unbound<Owner>}`
  : D extends RemoteDefinition
    ? Bound extends true
      ? `${Label} (${D["type"]}): unknown endpoint "${D["endpoint"]}"`
      : `${Label} (${D["type"]}): ${Unbound<Owner>}`
    : never;
type Unbound<Owner> = Owner extends "Form"
  ? "define the form with the defineForm of createForms"
  : "define the rule set with the defineRules of createForms";
// A field of a subtype also fits its base: where Allowed has no subtypes, it
// is foreign. Computed once per section, as the rejected ones.
type Tagged = { readonly subtype: string };
type Foreign<D, Allowed> = [D] extends [{ readonly type: string; readonly subtype?: undefined }]
  ? never
  : Exclude<Extract<D, Tagged>, Extract<Allowed, Tagged>>;
type Rejected<D, Allowed> = Exclude<D, Allowed> | Foreign<D, Allowed>;
// The fields of every member of a section: keyof a union keeps only the keys
// that all its members share.
type FieldsOf<F> = F extends unknown ? F[keyof F] : never;
export type Admitted<F extends Fields, Allowed, Bound, Owner = "Form"> = [
  Rejected<FieldsOf<F>, Allowed>,
] extends [never]
  ? unknown
  : {
      readonly [K in keyof F]: [Rejected<F[K], Allowed>] extends [never]
        ? unknown
        : Rejection<`Field "${K & string}"`, F[K], Bound, Owner>;
    };
// A collection takes no name of a field, and its rows the field types Allowed,
// as the header: the message names the field and its collection.
type CollectionMessage<
  F extends Fields,
  N,
  R extends Fields,
  Allowed,
  Bound,
  Owner,
> = N extends keyof F
  ? `collection "${N & string}" has the name of a field`
  : [Rejected<FieldsOf<R>, Allowed>] extends [never]
    ? never
    : {
        readonly fields: {
          readonly [X in keyof R]: [Rejected<R[X], Allowed>] extends [never]
            ? unknown
            : Rejection<`Field "${X & string}" of "${N & string}"`, R[X], Bound, Owner>;
        };
      };
export type AdmittedCollections<F extends Fields, K, Allowed, Bound, Owner = "Form"> = [
  { [N in keyof K]: CollectionMessage<F, N, FieldsIn<K[N]>, Allowed, Bound, Owner> }[keyof K],
] extends [never]
  ? unknown
  : {
      readonly [N in keyof K]: Verdict<
        CollectionMessage<F, N, FieldsIn<K[N]>, Allowed, Bound, Owner>
      >;
    };
export type DefineForm<
  M,
  Allowed = CoreDefinition | RemoteFieldOf<M>,
  Bound extends boolean = [M] extends [undefined] ? false : true,
> = <
  const F extends Fields,
  const O extends Record<string, unknown> = {},
  P = {},
  L = {},
  C = undefined,
  X = unknown,
  const K extends Collections | undefined = {},
  const I extends readonly Includable[] | undefined = undefined,
>(
  config: FormConfig<F, O, P, L, C, X, M, K, I> & {
    readonly fields: NoInfer<Admitted<F, Allowed, Bound>>;
    readonly collections?: NoInfer<AdmittedCollections<F, Declared<K>, Allowed, Bound>> | undefined;
    readonly include?: Include<F, Declared<K>, C, M, I, P>;
  },
) => FormDefinition<
  F,
  O,
  C,
  [I] extends [undefined] ? QueriesOf<P> : Joined<QueriesOf<P>, IncludedQueries<I>>,
  Declared<K>,
  JoinedRows<RowQueriesOf<P, Declared<K>>, I, Declared<K>>
>;
// With explicit type arguments I is undefined, and include takes any list,
// unchecked; otherwise I infers the list as written, and each set is checked.
// The message goes first, so that it is the type an error shows.
type Include<F, K, C, M, I, P> = [I] extends [undefined]
  ? readonly Includable[] | undefined
  : NoInfer<IncludeChecks<F, K, C, M, I, P>> & I;
// The queries of the rules as written and those of the rule sets, as one
// anonymous object type; without include, those of the rules alone.
type Joined<A, B> = [keyof B] extends [never]
  ? A
  : { [X in keyof (A & B)]: (A & B)[X] } extends infer T extends Record<string, QueryState>
    ? T
    : never;
type JoinedRows<W, I, K> = [I] extends [undefined]
  ? W
  : {
        readonly [N in keyof W]: Joined<W[N], IncludedRowQueries<I, N & keyof K>>;
      } extends infer T extends Record<string, Readonly<Record<string, QueryState>>>
    ? T
    : never;
