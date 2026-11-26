import type { Keys, Member, Unknown } from "./authoring-checks.js";
import type { RowFormula } from "./authoring-rows.js";
import type { Formula } from "./authoring.js";
import type { Fields, FieldsIn } from "./definition.js";
import type { FieldDefinition, FieldValue } from "./fields.js";
import type { NameOf } from "./rule-set-types.js";

export type HeaderRelation<F extends Fields, K, C, X> = {
  readonly default: NameOf<Exclude<keyof F, X>>;
  readonly members: {
    readonly [Y in Exclude<keyof F, X>]?: Formula<F, K, C, FieldValue<F[Y]> | undefined>;
  };
};
export type RowRelation<F extends Fields, K, C, N extends keyof K, X> = {
  readonly default: NameOf<Exclude<keyof FieldsIn<K[N]>, X>>;
  readonly members: {
    readonly [Y in Exclude<keyof FieldsIn<K[N]>, X>]?: RowFormula<
      F,
      K,
      C,
      N,
      FieldValue<FieldsIn<K[N]>[Y]> | undefined
    >;
  };
};

// The possible member names of a relation as written, for claims between sets.
export type MembersOf<R> = NameOf<Keys<Member<R, "members">>>;
type Takes = "value" | "onChange" | "onEdit";
type Declared<E> = {
  [Q in Keys<E> & Takes]: [Member<E, Q>] extends [never] ? never : Q;
}[Keys<E> & Takes];
type Taken<P, X, Y extends string, Of extends string> = {
  [Z in Keys<P>]: NameOf<Z> extends Y
    ? `field "${NameOf<Z>}"${Of} ${Declared<Member<P, Z>>} is taken by the relation of "${NameOf<X>}"`
    : never;
}[Keys<P>];
type Shared<P, X, Y extends string, Of extends string> = {
  [
    Z in Exclude<Keys<P>, X>
  ]: `field "${Extract<MembersOf<Member<Member<P, Z>, "relation">>, Y>}"${Of} is a member of the relations of "${NameOf<X>}" and "${NameOf<Z>}"`;
}[Exclude<Keys<P>, X>];

// Each of exactly two names leaves exactly one other name.
type Single<U, All = U> = U extends unknown
  ? [Exclude<All, U>] extends [never]
    ? true
    : false
  : never;
type Pair<U, All = U> = U extends unknown
  ? [Exclude<All, U>] extends [never]
    ? false
    : Single<Exclude<All, U>>
  : never;
type CountMessage<X, Y, Of extends string> = [true] extends [Pair<Y>]
  ? never
  : `relation of "${NameOf<X>}"${Of} takes two members`;
type MemberMessage<R extends Fields, X, Y, Of extends string> = Y extends string
  ? Y extends NameOf<X>
    ? `field "${NameOf<X>}"${Of} cannot be a member of its own relation`
    : Y extends NameOf<keyof R>
      ? never
      : `relation member "${Y}" of "${NameOf<X>}"${Of} is not a field`
  : never;
type DriverMessage<D extends FieldDefinition, X, Y, Of extends string> = D extends {
  readonly type: "select";
}
  ?
      | `relation member "${Exclude<Y, FieldValue<D>> & string}" is not an option of field "${NameOf<X>}"${Of}`
      | `option "${Exclude<FieldValue<D>, Y | null> & (string | number)}" of field "${NameOf<X>}"${Of} is not a member of its relation`
  : D extends { readonly type: "text" }
    ? "" extends Y
      ? `field "${NameOf<X>}"${Of} cannot have a member named after the empty text ""`
      : never
    : `field "${NameOf<X>}"${Of} drives a relation, it must be a text or a select`;

// Check the relation only where it is declared, within each alternative of
// the rules. A conditional members object must be valid in each branch.
export type RelationMessages<
  R extends Fields,
  X extends keyof R,
  P,
  Of extends string = "",
> = P extends unknown ? RelationIn<R, X, Member<Member<P, X>, "relation">, P, Of> : never;
type RelationIn<R extends Fields, X extends keyof R, V, P, Of extends string> = V extends (
  ...args: never
) => unknown
  ? `relation of "${NameOf<X>}"${Of} takes default and members`
  : V extends object
    ?
        | `relation of "${NameOf<X>}"${Of} takes default and members, not "${NameOf<Exclude<Keys<V>, "default" | "members">>}"`
        | Unknown<"relation property", Extract<Keys<V>, symbol>, Of>
        | MemberVariants<R, X, V, P, Of>
    : `relation of "${NameOf<X>}"${Of} takes default and members`;
type MemberVariants<
  R extends Fields,
  X extends keyof R,
  V,
  P,
  Of extends string,
  M = Member<V, "members">,
> = M extends unknown ? MemberChecks<R, X, V, P, Of, M> : never;
type OptionalMembers<M> = {
  [Y in keyof M]-?: undefined extends M[Y] ? NameOf<Y> : never;
}[keyof M];
type MemberChecks<
  R extends Fields,
  X extends keyof R,
  V,
  P,
  Of extends string,
  M,
  Y extends string = NameOf<keyof M>,
> =
  | Unknown<"relation member", Extract<keyof M, symbol>, Of>
  | `relation member "${OptionalMembers<M>}" of "${NameOf<X>}"${Of} must have a formula`
  | `relation default "${Exclude<Member<V, "default">, Y> & string}" of "${NameOf<X>}"${Of} is not a member`
  | CountMessage<X, Y, Of>
  | MemberMessage<R, X, Y, Of>
  | DriverMessage<R[X], X, Y, Of>
  | Taken<P, X, Y, Of>
  | Shared<P, X, Y, Of>;
