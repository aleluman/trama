// The checks of the values an author writes outside of formulas: the query of
// an entry, with its endpoint, its params and its patch, and the defaults of a
// form, which its context gives.
import type { DeepReadonly } from "./data.js";
import type { ContextTools, Fields } from "./definition.js";
import type { PagedKey, ParamsIn, QueryKey, ResultIn } from "./endpoints.js";
import type { FieldValue } from "./fields.js";
import type {
  At,
  Checked,
  EventMessages,
  Keys,
  MayLack,
  Unknown,
  Verdict,
} from "./authoring-checks.js";
import type { Formula, Patch, Values } from "./authoring.js";

// A query of an entry: the endpoint gives a value or a whole list, its params
// are required when the endpoint requires them, and patch writes fields with
// the result. Without patch the result is written to the field of the entry.
// forPrepare makes prepare wait for it. M is the registry of the defineForm,
// undefined for the one of the core, which takes no query.
type QueryPatch<F extends Fields, K, C, R> = (
  result: R,
  tools: { readonly values: Values<F, K> } & ContextTools<C>,
) => Patch<F> | undefined;
type QueryOf<F extends Fields, K, C, E extends string, R, P> = {
  readonly endpoint: E;
  readonly patch?: QueryPatch<F, K, C, R> | undefined;
  readonly forPrepare?: boolean | undefined;
} & ({} extends P
  ? { readonly params?: Formula<F, K, C, P | undefined> | undefined }
  : { readonly params: Formula<F, K, C, P | undefined> });
// A paged endpoint is a member too, so that its key stays a literal, and its
// message rejects it also without the rules as written. The core takes any
// query, and its check rejects it.
export type Paged<E extends string> =
  `query endpoint "${E}" is paged; use a value or list endpoint`;
export type QueryRule<F extends Fields, K, C, M> = [M] extends [undefined]
  ? unknown
  :
      | {
          [E in QueryKey<M>]: QueryOf<F, K, C, E, ResultIn<M[E]>, ParamsIn<M[E]>>;
        }[QueryKey<M>]
      | { [E in PagedKey<M>]: QueryOf<F, K, C, E, never, ParamsIn<M[E]>> & Paged<E> }[PagedKey<M>];
// A query as written: its properties, its endpoint and, without patch, whether
// the result fits the field of the entry. Each member of a union is checked.
// Of names the collection of a field of a row, ` of "lines"`, and R are the
// fields its patch writes: those of the header, or those of its own row.
export type QueryMessages<R extends Fields, X, V, M, Of extends string = ""> = [M] extends [
  undefined,
]
  ? [Exclude<V, undefined>] extends [never]
    ? never
    : `Field "${X & string}"${Of} query: define the form with the defineForm of createForms`
  : V extends object
    ?
        | Unknown<
            "query property",
            Exclude<keyof V, "endpoint" | "params" | "patch" | "forPrepare">
          >
        | QueryEndpointMessages<R, X, V, M, At<V, "endpoint">, Of>
    : never;
// Without patch, or with one that may be missing, the result must fit the
// field of the entry; every patch that may run is checked as an event.
type QueryEndpointMessages<R extends Fields, X, V, M, E, Of extends string> =
  E extends PagedKey<M>
    ? Paged<E>
    : E extends QueryKey<M>
      ?
          | (MayLack<At<V, "patch">> extends true ? Unfit<R, X, M, E, Of> : never)
          | EventMessages<
              R,
              NonNullable<At<V, "patch">>,
              {},
              Of,
              "query patch returns a patch object or undefined",
              "query patch is synchronous"
            >
      : never;
type Unfit<
  R extends Fields,
  X,
  M,
  E extends keyof M & string,
  Of extends string,
> = X extends keyof R
  ? [ResultIn<M[E]>] extends [FieldValue<R[X]> | undefined]
    ? never
    : `query result of "${E}" does not fit field "${X & string}"${Of}`
  : never;
// Default values from the context: some fields, each with a value of the
// field; undefined is not a value.
type DefaultValues<F extends Fields> = { readonly [X in keyof F]?: FieldValue<F[X]> };
type Defaults<F extends Fields, C> = (context: DeepReadonly<C>) => DefaultValues<F>;
// The object returned may escape excess property checks, as rules do: X is the
// section as written, and the names it returns are checked again.
type DefaultsMessages<F extends Fields, X> = X extends (...args: never) => infer R
  ? [Extract<R, PromiseLike<unknown>>] extends [never]
    ? [Exclude<R, object>] extends [never]
      ? Unknown<"defaults field", Exclude<Keys<R>, keyof F>>
      : "defaults return an object of values"
    : "defaults are synchronous"
  : never;
// The defaults defineForm accepts for fields F and context C, where X is the
// section as written, as in rules; without a context there are none.
export type DefaultsRules<F extends Fields, C, X> = Defaults<F, C> &
  (undefined extends C ? "defaults require a context" : Verdict<DefaultsMessages<F, Checked<X>>>);
