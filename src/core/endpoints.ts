import {
  copyData,
  describe,
  isOption,
  isPlainRecord,
  own,
  type DeepReadonly,
  type OptionShape,
  type PlainData,
  type PlainOption,
  type PlainRecord,
} from "./data.js";
import type { EndpointTable } from "./compiled.js";
import type { SubtypeFactories } from "./subtype-types.js";
import {
  wrapError,
  type field,
  type AsyncConfig,
  type AsyncDefinition,
  type MultiAsyncConfig,
  type MultiAsyncDefinition,
} from "./fields.js";

// The identity that separates the remote data of a session, such as the company.
export type Scope = string | number;
// The key Trama builds for every request: an options page, or a whole list or
// a value.
export type LoadKey =
  | readonly ["trama", Scope, endpoint: string, params: object, search: string, page: number]
  | readonly ["trama", Scope, endpoint: string, params: object];
// Runs the requests of a session. run calls the endpoint, then validates and
// freezes what it returns, so a cache keeps valid data; the loader resolves
// with what run resolved. signal belongs to the consumer: a view of a list, or
// a query.
export type Loader = <T>(
  key: LoadKey,
  run: (signal: AbortSignal) => Promise<T>,
  options: { readonly signal: AbortSignal },
) => Promise<T>;

export type OptionsRequest = {
  readonly search: string;
  readonly page: number;
  readonly signal: AbortSignal;
  readonly scope: Scope;
};
export type ListRequest = { readonly signal: AbortSignal; readonly scope: Scope };

// An endpoint gives pages of options, searched by the server, a whole list,
// searched locally, or a value, which a query writes.
type Kind = "options" | "list" | "value";
declare const endpointTypes: unique symbol;
// An endpoint of kind T whose options, or value, are O and whose params are P,
// in types.
export type Endpoint<T extends Kind = Kind, O = unknown, P = unknown> = {
  readonly [endpointTypes]: { readonly kind: T; readonly option: O; readonly params: P };
};
// What defineEndpoints accepts. It does not mention the option or the params:
// a contextual type with them would infer P = any where load has no params.
type AnyEndpoint = { readonly [endpointTypes]: { readonly kind: Kind } };
export type OptionIn<E> = E extends {
  readonly [endpointTypes]: { readonly option: infer O extends OptionShape };
}
  ? O
  : never;
export type ParamsIn<E> = E extends { readonly [endpointTypes]: { readonly params: infer P } }
  ? P
  : never;
// What a query of the endpoint E receives: its value, or its whole list. A
// result typed any, such as that of response.json(), stays as it is: read-only
// in depth it would be an object with an index signature.
export type ResultIn<E> = E extends {
  readonly [endpointTypes]: { readonly kind: infer T; readonly option: infer O };
}
  ? 0 extends 1 & O
    ? T extends "list"
      ? readonly O[]
      : O
    : T extends "list"
      ? readonly DeepReadonly<O>[]
      : DeepReadonly<O>
  : never;

// An endpoint of a registry, with the key it is registered under.
export type ResolvedEndpoint = {
  readonly key: string;
  readonly kind: Kind;
  readonly load: (request: object, params: object) => unknown;
};
const endpoints = new WeakMap<object, Omit<ResolvedEndpoint, "key">>();
const create = (kind: Kind, load: unknown): never => {
  if (typeof load !== "function") throw new Error("Endpoint: load must be a function");
  const created = Object.freeze({});
  endpoints.set(created, { kind, load: load as ResolvedEndpoint["load"] });
  return created as never;
};
// P is the annotation of the second parameter of load, {} without one; O is
// the option of its result.
export const endpoint = {
  options: <O extends PlainOption, P extends PlainRecord = {}>(
    load: (
      request: OptionsRequest,
      params: P,
    ) => Promise<{ readonly options: readonly O[]; readonly more: boolean }>,
  ): Endpoint<"options", O, P> => create("options", load),
  list: <O extends PlainOption, P extends PlainRecord = {}>(
    load: (request: ListRequest, params: P) => Promise<readonly O[]>,
  ): Endpoint<"list", O, P> => create("list", load),
  // A value, which may be undefined: a query writes nothing then.
  value: <V extends PlainData, P extends PlainRecord = {}>(
    load: (request: ListRequest, params: P) => Promise<V>,
  ): Endpoint<"value", V, P> => create("value", load),
};

declare const registryEndpoints: unique symbol;
export type Registry<E = Record<string, AnyEndpoint>> = { readonly [registryEndpoints]: E };
const registries = new WeakMap<object, EndpointTable>();
// Endpoints are declared in domain modules, without React or Query.
export const defineEndpoints = <const E extends Record<string, AnyEndpoint>>(
  declared: E,
): Registry<E> => {
  if (!isPlainRecord(declared)) throw new Error("Endpoints must be an object of endpoints");
  const table = new Map<string, ResolvedEndpoint>();
  for (const [key, value] of Object.entries(declared)) {
    const found = typeof value === "object" && value !== null ? endpoints.get(value) : undefined;
    if (found === undefined)
      throw new Error(
        `Endpoint "${key}" must be created with endpoint.options, endpoint.list or endpoint.value`,
      );
    table.set(key, Object.freeze({ key, ...found }));
  }
  const registry = Object.freeze({});
  registries.set(registry, table);
  return registry as never;
};
// The endpoints of a registry that defineEndpoints created, by key.
export const endpointsOf = (registry: unknown) =>
  typeof registry === "object" && registry !== null ? registries.get(registry) : undefined;

// The keys of the endpoints a remote field can take, and those a query can.
export type RemoteKey<M> = {
  [K in keyof M]: M[K] extends Endpoint<"options" | "list"> ? K : never;
}[keyof M] &
  string;
export type QueryKey<M> = {
  [K in keyof M]: M[K] extends Endpoint<"value" | "list"> ? K : never;
}[keyof M] &
  string;
export type PagedKey<M> = {
  [K in keyof M]: M[K] extends Endpoint<"options"> ? K : never;
}[keyof M] &
  string;
// The remote fields of the registry M, single and multiple, one per key.
export type RemoteFieldOf<M> = {
  [K in RemoteKey<M>]:
    | AsyncDefinition<OptionIn<M[K]>, ParamsIn<M[K]>, K>
    | MultiAsyncDefinition<OptionIn<M[K]>, ParamsIn<M[K]>, K>;
}[RemoteKey<M>];
// The field of the core, plus the remote fields of the registry M, by key,
// and the factory of each subtype of S.
export type BoundField<M, S = {}> = typeof field & {
  readonly async: <const K extends RemoteKey<M>>(
    key: K,
    config?: AsyncConfig<OptionIn<M[K]>>,
  ) => AsyncDefinition<OptionIn<M[K]>, ParamsIn<M[K]>, K>;
  readonly multiAsync: <const K extends RemoteKey<M>>(
    key: K,
    config?: MultiAsyncConfig<OptionIn<M[K]>>,
  ) => MultiAsyncDefinition<OptionIn<M[K]>, ParamsIn<M[K]>, K>;
} & SubtypeFactories<M, S>;

// The key of a request and its run: run calls the endpoint and validates and
// freezes its result, so a cache keeps valid data. A page takes the search text
// and its number; a whole list and a value, neither.
export const requestOf = (
  { key, kind, load }: ResolvedEndpoint,
  scope: Scope,
  params: object,
  text: string,
  page: number,
): { readonly key: LoadKey; readonly run: (signal: AbortSignal) => Promise<unknown> } => {
  if (kind !== "options")
    return {
      key: Object.freeze(["trama", scope, key, params] as const),
      run: async (signal) => {
        const result = await load(Object.freeze({ signal, scope }), params);
        return kind === "list"
          ? checkList(key, result)
          : copyData(result, `Endpoint "${key}": result`);
      },
    };
  return {
    key: Object.freeze(["trama", scope, key, params, text, page] as const),
    run: async (signal) =>
      checkPage(
        key,
        page,
        await load(Object.freeze({ search: text, page, signal, scope }), params),
      ),
  };
};

// Asks the loader for a request with the signal of its consumer. A loader
// that throws, instead of rejecting, rejects the promise all the same.
export const send = (
  loader: Loader,
  { key, run }: ReturnType<typeof requestOf>,
  signal: AbortSignal,
): Promise<unknown> =>
  new Promise((resolve) => {
    resolve(loader(key, run, { signal }));
  });

// A page of options and whether more follow.
export type Page = {
  readonly options: readonly DeepReadonly<OptionShape>[];
  readonly more: boolean;
};
const checkPage = (key: string, page: number, value: unknown): Page => {
  const at = `Endpoint "${key}" page ${page}`;
  const options = isPlainRecord(value) ? own(value, "options") : undefined;
  const more = isPlainRecord(value) ? own(value, "more") : undefined;
  if (!Array.isArray(options) || typeof more !== "boolean")
    throw new Error(`${at}: expected { options, more }`);
  return Object.freeze({ options: checkOptions(at, options), more });
};
const checkList = (key: string, value: unknown) => {
  const at = `Endpoint "${key}"`;
  if (!Array.isArray(value)) throw new Error(`${at}: expected an array of options`);
  return checkOptions(at, value);
};
// Each option is validated and copied in one walk; a repeated value is an
// error of its page.
const checkOptions = (at: string, options: readonly unknown[]) => {
  const values = new Set<unknown>();
  const checked = Array.from(options, (option, index) => {
    if (!isOption(option)) throw new Error(`${at}: option ${index}: expected value and label`);
    let copy: unknown;
    try {
      copy = copyData(option, "option");
    } catch (error) {
      throw wrapError(`${at}: option ${index}`, error);
    }
    if (values.has(option.value))
      throw new Error(`${at}: duplicate option value ${describe(option.value)}`);
    values.add(option.value);
    return copy as DeepReadonly<OptionShape>;
  });
  return Object.freeze(checked);
};
