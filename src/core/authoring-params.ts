// The params that the rule sets of a form leave to its rules: the layers that
// require them, and, without rules, the message that says why they are left.
import type { Fields, FieldsIn } from "./definition.js";
import type { ParamsOf } from "./fields.js";
import type { Formula, RequiredCollections, RequiredEntries, RequiredRows } from "./authoring.js";
import type { RemainingEach } from "./authoring-rows.js";
import type { FieldName, Given, Lists, NameOf, Part } from "./rule-set-types.js";

// The required entries that G does not give, of the header or, with Scope
// ["rows", collection], of its rows; G names them as text.
export type Left<X, G, Scope extends readonly string[] = ["header"]> = X extends unknown
  ? [...Scope, NameOf<X>] extends G
    ? never
    : X
  : never;
// Those of the rows of collection N, and the collections whose rows still
// require params, in each member of K.
type LeftRows<K, N, G> = Left<RequiredRows<FieldsIn<K[N & keyof K]>>, G, ["rows", NameOf<N>]>;
type RemainingCollections<K, G> = K extends unknown
  ? { [N in keyof K]-?: [LeftRows<K, N, G>] extends [never] ? never : N }[keyof K]
  : never;
// Each of X as a key of the params given: ["header", field] or ["rows",
// collection, field].
type Keyed<X, Scope extends readonly unknown[]> = X extends unknown ? [...Scope, NameOf<X>] : never;

// Without rules, a form whose rule sets leave required params needs them: the
// key that rules lack names why. Only forms with required params compute it.
declare const needsParams: unique symbol;
export type ParamsLeftRules<F extends Fields, K, I> = [
  RequiredEntries<F> | RequiredCollections<K>,
] extends [never]
  ? unknown
  : ParamsMessage<ParamsLeft<F, K, Given<I>>, I> extends infer X
    ? [X] extends [never]
      ? unknown
      : { readonly rules: { readonly [needsParams]?: X } }
    : never;
type ParamsLeft<F extends Fields, K, G> =
  | Keyed<Left<RequiredEntries<F>, G>, ["header"]>
  | {
      [N in RemainingCollections<K, G>]: Keyed<LeftRows<K, N, G>, ["rows", NameOf<N>]>;
    }[RemainingCollections<K, G>];
// Why they are left: no set gives them, the one that gives them may be absent,
// or it is in a list of unknown length, such as a preset without as const.
type ParamsMessage<X, I> = X extends unknown ? `${FieldName<X>} needs params: ${Why<X, I>}` : never;
type Why<X, I> =
  X extends Possibly<I, "loose">
    ? 'a list without "as const" may lack the rule set that gives them'
    : X extends Possibly<I, "fixed">
      ? "the rule set that gives them may be absent"
      : "give them in rules or in a rule set always included";
type Possibly<I, Where> =
  Lists<I> extends infer L
    ? L extends readonly unknown[]
      ? {
          [J in keyof L]: (J extends `${number}` ? "fixed" : "loose") extends Where
            ? Part<L[J], "gives">
            : never;
        }[number]
      : never
    : never;

// With rule sets, the required entries that they leave: G are the params they
// surely give.
export type RemainingLayers<F extends Fields, K, C, M, G> = ([Left<RequiredEntries<F>, G>] extends [
  never,
]
  ? unknown
  : {
      readonly [X in Left<RequiredEntries<F>, G>]: {
        readonly params: Formula<F, K, C, ParamsOf<F[X]> | undefined>;
      };
    }) &
  ([RemainingCollections<K, G>] extends [never]
    ? unknown
    : {
        readonly [N in RemainingCollections<K, G>]: RemainingEach<F, K, C, N & keyof K, M, G>;
      });
