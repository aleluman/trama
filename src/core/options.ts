// The options of a session: its scope, its loader and its context, in types
// and as they are checked when it opens.
import type {
  FieldsIn,
  FormContext,
  FormDefinition,
  FormQueries,
  RowQueries,
} from "./definition.js";
import type { Compiled } from "./compiled.js";
import type { FormInitial } from "./row-types.js";
import { copyData, isKey, type DeepReadonly } from "./data.js";
import type { Loader, Scope } from "./endpoints.js";
import { isRecord, type RemoteDefinition } from "./fields.js";

export type FieldsOf<D extends FormDefinition> = D["fields"];
// The context a form declares is required, of its type, also read-only; a form
// without context takes none, and undefined is omitting it.
type ContextOption<C> = undefined extends C
  ? { readonly context?: C }
  : { readonly context: DeepReadonly<C> };
type SessionOptions<D extends FormDefinition> = {
  readonly initial?: FormInitial<D> | undefined;
  readonly loader?: Loader | undefined;
} & ContextOption<FormContext<D>>;
// Whether a definition, or any member of a union of them, may have a remote
// field, in the header or in the rows of a collection: a field whose
// definition may be remote counts.
type MayBeAsync<D extends FormDefinition> = D extends FormDefinition
  ? string extends keyof FieldsOf<D>
    ? never
    : RemoteAmong<FieldsOf<D>> | RemoteRows<D["collections"]>
  : never;
// Also in each member of a union of fields or of collections.
type RemoteAmong<F> = F extends unknown
  ? { [K in keyof F]: [Extract<F[K], RemoteDefinition>] extends [never] ? never : true }[keyof F]
  : never;
type RemoteRows<K> = K extends unknown
  ? { [N in keyof K]-?: RemoteAmong<FieldsIn<K[N]>> }[keyof K]
  : never;
// Whether a definition, or any member of a union of them, may declare a query,
// in the header or in the rows of a collection; the wide definition may not.
type MayQuery<D extends FormDefinition> = D extends FormDefinition
  ? string extends keyof FormQueries<D>
    ? never
    : Keyed<FormQueries<D>> | QueryRows<D>
  : never;
type QueryRows<D extends FormDefinition> = {
  [N in keyof D["collections"] & string]-?: Keyed<RowQueries<D, N>>;
}[keyof D["collections"] & string];
// Whether a record, or any member of a union of them, has a key.
type Keyed<T> = T extends unknown ? ([keyof T] extends [never] ? never : true) : never;
// scope is required when the form may have remote fields or queries. The
// options are required when any of them is.
type Options<D extends FormDefinition> = SessionOptions<D> &
  ([MayBeAsync<D> | MayQuery<D>] extends [never]
    ? { readonly scope?: Scope | undefined }
    : { readonly scope: Scope });
export type OptionsArgument<D extends FormDefinition> =
  {} extends Options<D> ? [options?: Options<D>] : [options: Options<D>];
// The loader by default keeps nothing: every request runs its endpoint.
const directLoader: Loader = (_, run, { signal }) => run(signal);

// Whether a remote field, or a query, is in the header or in the rows of a
// collection.
const declares = (compiled: Compiled, part: "endpoints" | "queries") =>
  compiled[part].size > 0 ||
  [...compiled.collections.values()].some((collection) => collection[part].size > 0);
// The scope, whose -0 is 0, the loader and the context of a session. The
// context is a frozen copy, apart from the application's object.
export const sessionOptions = (options: unknown, compiled: Compiled) => {
  const { scope, loader, context } = (isRecord(options) ? options : {}) as {
    readonly scope?: unknown;
    readonly loader?: unknown;
    readonly context?: unknown;
  };
  if (scope === undefined && declares(compiled, "endpoints"))
    throw new Error("Form with async fields requires a scope");
  if (scope === undefined && declares(compiled, "queries"))
    throw new Error("Form with queries requires a scope");
  if (scope !== undefined && !isKey(scope))
    throw new Error("Session scope must be a string or a finite number");
  if (loader !== undefined && typeof loader !== "function")
    throw new Error("Session loader must be a function");
  if (!compiled.context && context !== undefined) throw new Error("Form declares no context");
  if (compiled.context && context === undefined) throw new Error("Form requires a context");
  if (compiled.context && !isRecord(context)) throw new Error("Session context must be an object");
  return {
    scope: Object.is(scope, -0) ? 0 : (scope as Scope | undefined),
    loader: (loader ?? directLoader) as Loader,
    context: context === undefined ? undefined : (copyData(context, "Session context") as object),
  };
};
