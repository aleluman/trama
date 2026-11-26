// The form section: the lock of the whole form, and its messages. Each entry
// of the lock contributes readOnly to every field but the listed ones: a
// field of the header by its name, or fields of the rows of a collection, in
// every row, by collection. An exception excludes only this contribution.
// error and warning are messages of the form, which read the header.
import type { Fields, FieldsIn } from "./definition.js";
import type {
  At,
  Checked,
  EmptyMessage,
  EmptyReason,
  Everywhere,
  Items,
  Keys,
  Member,
  Reported,
  Result,
  Unknown,
} from "./authoring-checks.js";
import type { Formula, Many, Reason } from "./authoring.js";

type Except<F extends Fields, K> = [keyof K] extends [never]
  ? keyof F & string
  :
      | (keyof F & string)
      | { readonly [N in keyof K]?: readonly (keyof FieldsIn<K[N]> & string)[] | undefined };
type Lock<F extends Fields, K, C> = {
  readonly value: Formula<F, K, C, boolean | Reason | undefined>;
  readonly except?: readonly Except<F, K>[] | undefined;
};
type FormSection<F extends Fields, K, C> = {
  readonly readOnly?: Many<Lock<F, K, C>> | undefined;
  readonly error?: Many<Formula<F, K, C, Reason | false | undefined>> | undefined;
  readonly warning?: Many<Formula<F, K, C, Reason | false | undefined>> | undefined;
};
type LockMessages<E> = E extends unknown
  ?
      | Unknown<"lock property", Exclude<keyof E, "value" | "except">>
      | EmptyReason<Result<At<E, "value">>>
  : never;
type CheckForm<L> = {
  [Q in Keys<L>]?: Q extends "readOnly"
    ? Reported<Member<L, Q>, LockMessages<Items<Member<L, Q>>>>
    : Q extends "error" | "warning"
      ? Reported<At<L, Q>, EmptyMessage<Q, Result<Items<At<L, Q>>>>>
      : Everywhere<At<L, Q>, `form property "${Q & string}" does not exist`>;
};
// The form section defineForm accepts for fields F and collections K, where L
// is the section as written, as in rules.
export type FormRules<F extends Fields, K, C, L> = FormSection<F, K, C> &
  CheckForm<Checked<L>> & {
    readonly [Symbol.hasInstance]?: "form must be an object of properties";
  };
