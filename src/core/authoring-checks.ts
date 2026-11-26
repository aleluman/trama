// The checks of authoring, in types. Reused objects escape excess property
// checks, so the sections are inferred as written and their names are checked
// again. A conditional or optional entry, or a union of handlers or of whole
// sections, is checked in every member: the keys of any member, and each
// member's messages. A valid member cannot absorb the message of another one.
import type { Fields } from "./definition.js";
import type { DateDefinition, NumberDefinition, WithPlaceholder } from "./fields.js";
import type { Limit, StateProperty } from "./state-properties.js";

export type { Limit };

export type Keys<T> = T extends unknown ? keyof T : never;
export type At<T, Q> = T extends unknown ? (Q extends keyof T ? T[Q] : never) : never;
export type Verdict<M> = [M] extends [never] ? unknown : M;
// An array reports the message on each element, where TypeScript shows it.
export type Reported<V, M> = [M] extends [never]
  ? unknown
  : V extends readonly unknown[]
    ? readonly M[]
    : M;
// Also rejects an empty array.
export type Everywhere<V, M> = V extends readonly unknown[] ? readonly M[] & M : M;
// Of names the collection of a field of a row: ` of "lines"`.
export type Unknown<What extends string, K, Of extends string = ""> = K extends string | number
  ? `${What} "${K}"${Of} does not exist`
  : K extends symbol
    ? `${What} with a symbol key does not exist`
    : never;
export type Items<V> = V extends readonly (infer E)[] ? E : V;
export type Result<V> = V extends (...args: never) => infer R ? R : never;
// Only a literal "" is known to be empty; any other string is checked when the
// formula runs.
export type EmptyReason<R> = [Extract<R, "">] extends [never] ? never : "reasons cannot be empty";
export type EmptyMessage<P extends string, R> = [Extract<R, "">] extends [never]
  ? never
  : `${P} messages cannot be empty`;
export type MayLack<T> = [T] extends [never] ? true : undefined extends T ? true : false;
// The checks are not inference sites. NoInfer would also hide the members of a
// union of sections from them; this form resolves to the union itself.
export type Checked<T> = [T][T extends unknown ? 0 : never];
export type Member<P, K> = NonNullable<At<P, K>>;
export type EditConflict<E, Label extends string> = E extends unknown
  ? [Member<E, "onEdit">] extends [never]
    ? never
    : [Member<E, "onChange">] extends [never]
      ? never
      : `${Label} declares onChange or onEdit, not both`
  : never;

// The fields a patch of a row writes, under each key of a collection: the
// patches of every key, also of an index that Object.fromEntries returns.
type RowPatches<V> = V extends object ? Extract<V[keyof V], object> : never;
// A patch type has only optional keys, so it would also take primitives. The
// patch of a query says so in its own words. A patch of the form also writes
// the rows of each collection of K, nested by key.
export type EventMessages<
  F extends Fields,
  E,
  K = {},
  Of extends string = "",
  Shape extends string = "events return a patch object or undefined",
  Sync extends string = "events are synchronous",
> = E extends (...args: never) => infer R
  ? [Extract<R, PromiseLike<unknown>>] extends [never]
    ? [Exclude<R, object | undefined>] extends [never]
      ?
          | Unknown<"patch field", Exclude<Keys<Extract<R, object>>, keyof F | keyof K>, Of>
          | NestedMessages<K, Extract<R, object>>
      : Shape
    : Sync
  : never;
export type NestedMessages<K, R> = {
  [N in keyof K & Keys<R>]: K[N] extends { readonly fields: infer W extends Fields }
    ? Unknown<"patch field", Exclude<Keys<RowPatches<At<R, N>>>, keyof W>, ` of "${N & string}"`>
    : never;
}[keyof K & Keys<R>];

// A property that field K lacks, because its type is not Has.
export type Lacks<
  F extends Fields,
  K,
  Has,
  What extends string,
  Of extends string = "",
> = K extends keyof F
  ? F[K] extends Has
    ? never
    : `field "${K & string}"${Of} has no ${What}`
  : never;
// A limit of field K, as written: the decimals of a number, or a min or a max
// of a number or a date, of its type or null. R is the result of a formula
// or the value of a patch. A union of definitions is checked in each member.
export type LimitMessages<F extends Fields, K, Q, R, Of extends string = ""> = K extends keyof F
  ? MemberLimit<F[K], K, Q, R, Of>
  : never;
type MemberLimit<D, K, Q, R, Of extends string> = D extends NumberDefinition
  ? Q extends "decimals"
    ? never
    : Takes<K, Q, R, number, "a number", Of>
  : [D, Q] extends [DateDefinition, "min" | "max"]
    ? Takes<K, Q, R, string, "a date", Of>
    : `field "${K & string}"${Of} has no ${Q & string}`;
type Takes<K, Q, R, T, What extends string, Of extends string> = [
  Exclude<R, T | null | undefined>,
] extends [never]
  ? never
  : `field "${K & string}"${Of} ${Q & string} takes ${What} or null`;
type DestinationMessages<F extends Fields, K, V, Of extends string, S = Extract<V, object>> = [
  Exclude<V, object | undefined>,
] extends [never]
  ?
      | Unknown<"state property", Exclude<Keys<S>, StateProperty>>
      | ("placeholder" extends Keys<S> ? Lacks<F, K, WithPlaceholder, "placeholder", Of> : never)
      | {
          [Q in Extract<Keys<S>, Limit>]: LimitMessages<F, K, Q, At<S, Q>, Of>;
        }[Extract<Keys<S>, Limit>]
      | EmptyReason<At<S, "disabled" | "readOnly">>
      | EmptyMessage<"required", At<S, "required">>
      | EmptyMessage<"error", At<S, "error">>
      | EmptyMessage<"warning", At<S, "warning">>
  : `states field "${K & string}"${Of} takes an object of properties`;
export type StateMessages<F extends Fields, E, Of extends string = ""> = E extends (
  ...args: never
) => infer R
  ? [Extract<R, PromiseLike<unknown>>] extends [never]
    ? [Exclude<R, object | undefined>] extends [never]
      ?
          | Unknown<"states field", Exclude<Keys<Extract<R, object>>, keyof F>, Of>
          | {
              [K in keyof F & Keys<Extract<R, object>>]: DestinationMessages<
                F,
                K,
                At<Extract<R, object>, K>,
                Of
              >;
            }[keyof F & Keys<Extract<R, object>>]
      : "states return a state patch object or undefined"
    : "state formulas are synchronous"
  : never;
