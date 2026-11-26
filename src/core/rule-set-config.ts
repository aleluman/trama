// defineRules in types: it infers its requirements and its rules as defineForm
// does, checks them in the same way without the layers of required params,
// and returns a RuleSet with what the rules as written derive.
import type { CoreDefinition } from "./fields.js";
import type { RemoteFieldOf } from "./endpoints.js";
import type { Collections, ContextDeclaration, Fields } from "./definition.js";
import type { Keys, Member } from "./authoring-checks.js";
import type { MembersOf } from "./authoring-relations.js";
import type { PropertyRules } from "./authoring.js";
import type {
  Admitted,
  AdmittedCollections,
  Declared,
  EachIn,
  NoContext,
  PropertyIn,
  QueriesOf,
  RowQueriesOf,
} from "./config.js";
import type { policies } from "./declarations.js";
import type { NameOf, RuleSet } from "./rule-set-types.js";

// The properties a form takes once per field, as the policies of execution
// say.
type Policies = typeof policies;
type Single = { [Q in keyof Policies]: Policies[Q] extends "single" ? Q : never }[keyof Policies];
// The single properties entry E declares, each as its key followed by the
// property; one that is only undefined declares nothing.
type Declares<E, Key extends readonly string[]> = {
  [Q in Keys<E> & Single]: [Member<E, Q>] extends [never]
    ? never
    : Q extends "relation"
      ? [...Key, Q] | MemberClaims<Key, MembersOf<Member<E, Q>>>
      : [...Key, Q extends "onChange" | "onEdit" ? "onChange or onEdit" : Q];
}[Keys<E> & Single];
type MemberClaims<Key extends readonly string[], Y> = Y extends string
  ? Key extends readonly [...infer Scope extends readonly string[], string]
    ? [...Scope, Y, "value"] | [...Scope, Y, "onChange or onEdit"]
    : never
  : never;
// The single properties of the rules P as written: ["header", field,
// property] or ["rows", collection, field, property], with each name as text.
// A conditional, so that declarations print the result and not this alias,
// whose arguments are the rules as written.
export type SinglesOf<P, K> = [P] extends [unknown] ? SinglesIn<P, K> : never;
type Name = string | number;
type SinglesIn<P, K> =
  | {
      [X in Exclude<Keys<P>, keyof K> & Name]: Declares<Member<P, X>, ["header", NameOf<X>]>;
    }[Exclude<Keys<P>, keyof K> & Name]
  | {
      [N in Keys<P> & keyof K & Name]: {
        [X in Keys<NonNullable<EachIn<P, N>>> & Name]: Declares<
          Member<NonNullable<EachIn<P, N>>, X>,
          ["rows", NameOf<N>, NameOf<X>]
        >;
      }[Keys<NonNullable<EachIn<P, N>>> & Name];
    }[Keys<P> & keyof K & Name];
// The params the rules surely give: ["header", field] or ["rows",
// collection, field]. A conditional, as SinglesOf.
export type SureParams<P, K> = [P] extends [unknown] ? SureParamsIn<P, K> : never;
type SureParamsIn<P, K> =
  | {
      [X in Exclude<Keys<P>, keyof K> & Name]: undefined extends PropertyIn<P, X, "params">
        ? never
        : ["header", NameOf<X>];
    }[Exclude<Keys<P>, keyof K> & Name]
  | {
      [N in Keys<P> & keyof K & Name]: {
        [X in Keys<NonNullable<EachIn<P, N>>> & Name]: undefined extends PropertyIn<
          EachIn<P, N>,
          X,
          "params"
        >
          ? never
          : ["rows", NameOf<N>, NameOf<X>];
      }[Keys<NonNullable<EachIn<P, N>>> & Name];
    }[Keys<P> & keyof K & Name];

// defineRules declares its requirements as defineForm does and checks its
// rules in the same way, without the layers of required params: a set may
// leave them to another one, or to the form.
export type DefineRules<
  M,
  Allowed = CoreDefinition | RemoteFieldOf<M>,
  Bound extends boolean = [M] extends [undefined] ? false : true,
> = <
  const F extends Fields = {},
  P = {},
  C = undefined,
  const K extends Collections | undefined = {},
>(
  config: {
    readonly fields?: (F & NoInfer<Admitted<F, Allowed, Bound, "Rule set">>) | undefined;
    readonly collections?:
      | (K & NoInfer<AdmittedCollections<F, Declared<K>, Allowed, Bound, "Rule set">>)
      | undefined;
    readonly context?: ContextDeclaration<C> | NoContext<C>;
    readonly rules: PropertyRules<NoInfer<F>, NoInfer<Declared<K>>, NoInfer<C>, P, M, "set">;
  } & { readonly rules: P },
) => RuleSet<{
  readonly fields: F;
  readonly collections: Declared<K>;
  readonly context: C;
  readonly queries: QueriesOf<P>;
  readonly rowQueries: RowQueriesOf<P, Declared<K>>;
  readonly declares: SinglesOf<P, Declared<K>>;
  readonly gives: SureParams<P, Declared<K>>;
  readonly bound: Bound;
}>;
