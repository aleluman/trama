// Subtypes in types: the factories that the field of createForms gains, the
// definitions they create and the fields that its defineForm and its
// defineRules admit.
import type { DeepReadonly } from "./data.js";
import type {
  AsyncConfig,
  AsyncDefinition,
  CoreDefinition,
  FieldDefinition,
  MultiAsyncConfig,
  MultiAsyncDefinition,
  MultiSelectDefinition,
  SelectDefinition,
  SelectOption,
} from "./fields.js";
import type { DeclaredState } from "./field-definitions.js";
import type { OptionIn, ParamsIn, RemoteFieldOf, RemoteKey } from "./endpoints.js";
import type { DefineForm } from "./config.js";
import type { DefineRules } from "./rule-set-config.js";

type Base = FieldDefinition["type"];
// The subtypes that createForms takes, by name.
export type Subtypes = { readonly [name: string]: { readonly base: Base } };

// A key of the option of its endpoint, in the presentation of a remote
// subtype: the factory of the field replaces it with the keys of that option.
// It exists in types only.
declare const optionKey: unique symbol;
export type OptionKey = string & { readonly [optionKey]: true };
// Replaces each OptionKey with K, also in arrays and objects. A conditional,
// so that declarations print the result rather than this alias.
type KeysOf<T, K> = T extends OptionKey
  ? K
  : T extends readonly unknown[]
    ? { [I in keyof T]: KeysOf<T[I], K> }
    : T extends object
      ? { [P in keyof T]: KeysOf<T[P], K> }
      : T;
type KeysIn<O, Option> = KeysOf<O, Extract<keyof Option, string>>;

// The presentation is required exactly when {} does not satisfy it.
type Shown<O> = {} extends O
  ? { readonly presentation?: DeepReadonly<O> | undefined }
  : { readonly presentation: DeepReadonly<O> };
type Given<O> = {} extends O
  ? { readonly presentation?: O | undefined }
  : { readonly presentation: O };
// The definition of a field of the subtype N of the base D, with the
// presentation O.
export type SubtypeDefinition<D extends FieldDefinition, N extends string, O> = D & {
  readonly subtype: N;
} & Shown<O>;

type Definition<B extends Base> = Extract<FieldDefinition, { readonly type: B }>;
type Args<C, O> = {} extends O ? [config?: C & Given<O>] : [config: C & Given<O>];
type Remote<B, O, P, K extends string> = B extends "async"
  ? AsyncDefinition<O, P, K>
  : MultiAsyncDefinition<O, P, K>;
type Choices<B, V extends string | number> = DeclaredState & {
  readonly label?: string | undefined;
  readonly options: readonly SelectOption<V>[];
  readonly default?: (B extends "select" ? NoInfer<V> | null : readonly NoInfer<V>[]) | undefined;
};
// The factory of the subtype N, declared as D, over the endpoints M: as that
// of its base, with the presentation.
type Factory<M, N, D> = D extends {
  readonly base: infer B extends Base;
  readonly presentation?: infer O;
}
  ? B extends "async" | "multiAsync"
    ? <const K extends RemoteKey<M>>(
        key: K,
        ...config: Args<
          B extends "async" ? AsyncConfig<OptionIn<M[K]>> : MultiAsyncConfig<OptionIn<M[K]>>,
          KeysIn<O, OptionIn<M[K]>>
        >
      ) => SubtypeDefinition<
        Remote<B, OptionIn<M[K]>, ParamsIn<M[K]>, K>,
        N & string,
        KeysIn<O, OptionIn<M[K]>>
      >
    : B extends "select" | "multiSelect"
      ? <const V extends string | number>(
          config: Choices<B, V> & Given<O>,
        ) => SubtypeDefinition<
          B extends "select" ? SelectDefinition<V> : MultiSelectDefinition<V>,
          N & string,
          O
        >
      : (
          ...config: Args<Omit<Definition<B>, "type">, O>
        ) => SubtypeDefinition<Definition<B>, N & string, O>
  : never;
export type SubtypeFactories<M, S> = { readonly [N in keyof S]: Factory<M, N, S[N]> };

// What a field of the subtype N, declared as D, is in any forms that declares
// it: its base, its name and its presentation, whose OptionKey are any key.
type SubtypeShape<D, N> = D extends {
  readonly base: infer B;
  readonly presentation?: infer O;
}
  ? { readonly type: B; readonly subtype: N } & Shown<KeysOf<O, string>>
  : never;
// The fields that the defineForm and the defineRules of createForms admit:
// those of the core and the remote ones of its endpoints M, without a
// subtype, and those of each subtype of S.
export type Admissible<M, S> = [keyof S] extends [never]
  ? CoreDefinition | RemoteFieldOf<M>
  : (CoreDefinition | RemoteFieldOf<M>) &
      ({ readonly subtype?: never } | { [N in keyof S]: SubtypeShape<S[N], N> }[keyof S]);
// The defineForm and the defineRules of createForms, for the endpoints M of
// its registries and its subtypes S.
export type BoundDefineForm<M, S = {}> = DefineForm<M, Admissible<M, S>>;
export type BoundDefineRules<M, S = {}> = DefineRules<M, Admissible<M, S>>;
