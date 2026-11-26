import type { Field, Row } from "./address.js";
import { canonicalParams, describe, equal } from "./data.js";
import type { EndpointTable } from "./compiled.js";
import type { ResolvedEndpoint } from "./endpoints.js";
import { isPlainRecord } from "./fields.js";
import { runFormula, type Context, type Read, type Reads, type RuleFormula } from "./reads.js";
import type { Source } from "./views.js";
import { unbound, type Owner } from "./remote-fields.js";

// The compiled params of an async field, what its lists send to its endpoint,
// or of a query, kept at its address: its name in the header, or the address
// of its field in the row of an instance.
export type ParamsFormula = {
  readonly kind: "params" | "query";
  readonly name: string;
  readonly address: Field;
  readonly label: string;
  readonly formula: RuleFormula;
  readonly row: Row | undefined;
};

// Params are a plain object, or undefined, which suspends. They keep the
// previous object while they are equal as data, so a list sees a change only
// when there is one.
export const evaluateParams = (
  rule: ParamsFormula,
  source: Source,
  read: Read,
  previous: object | undefined,
  context: Context,
): { readonly params: object | undefined; readonly reads: Reads } => {
  const { result, reads } = runFormula(rule, source, read, context);
  if (result === undefined) return { params: undefined, reads };
  if (!isPlainRecord(result))
    throw new Error(
      `${rule.label}: incompatible result ${describe(result)}, expected a plain object or undefined`,
    );
  const params = canonicalParams(result, rule.label) as object;
  return { params: previous !== undefined && equal(previous, params) ? previous : params, reads };
};

// The query of an entry of rules: its endpoint gives a value or a whole list,
// and patch turns the result into the fields it writes. index is its place
// among the queries of the header, or of the each of its collection, which
// orders their starts. Its label, that of a template in a row, ends with the
// place of its rule set, if any. A query forPrepare is one that prepare waits
// for.
export type CompiledQuery = {
  readonly name: string;
  readonly label: string;
  readonly index: number;
  readonly endpoint: ResolvedEndpoint;
  readonly patch: ((result: unknown, tools: object) => unknown) | undefined;
  readonly forPrepare: boolean;
};
// A query as checked when its rules are declared: its endpoint, resolved in
// the registry of their defineForm or defineRules, and its functions.
export type CheckedQuery = {
  readonly endpoint: ResolvedEndpoint;
  readonly params: RuleFormula | undefined;
  readonly patch: CompiledQuery["patch"];
  readonly forPrepare: boolean;
};

const properties = new Set(["endpoint", "params", "patch", "forPrepare"]);
// The query of a field, of the header or of the rows of a collection, whose
// label prefix names it. The defineForm and the defineRules of the core have
// no endpoints, so they take none.
export const checkQuery = (
  prefix: string,
  declared: unknown,
  table: EndpointTable | undefined,
  owner: Owner,
): CheckedQuery => {
  const label = `${prefix} query`;
  if (table === undefined) throw new Error(`${label}: ${unbound(owner)}`);
  if (!isPlainRecord(declared))
    throw new Error(
      `${label}: expected an object with endpoint, params, patch and optional forPrepare`,
    );
  for (const key of Object.keys(declared))
    if (!properties.has(key)) throw new Error(`${label}: unknown property "${key}"`);
  const { endpoint: key, params, patch, forPrepare } = declared;
  const endpoint = typeof key === "string" ? table.get(key) : undefined;
  if (endpoint === undefined) throw new Error(`${label}: unknown endpoint ${describe(key)}`);
  if (endpoint.kind === "options")
    throw new Error(`${label}: endpoint "${endpoint.key}" is paged; use a value or list endpoint`);
  if (params !== undefined && typeof params !== "function")
    throw new Error(`${label}: params must be a function`);
  if (patch !== undefined && typeof patch !== "function")
    throw new Error(`${label}: patch must be a function`);
  if (forPrepare !== undefined && typeof forPrepare !== "boolean")
    throw new Error(`${label}: forPrepare must be a boolean`);
  return Object.freeze({
    endpoint,
    params: params as RuleFormula | undefined,
    patch: patch as CompiledQuery["patch"],
    forPrepare: forPrepare === true,
  });
};
// The query of the field name at index, whose params observe the values as
// those of an async field do.
export const compileQuery = (
  name: string,
  prefix: string,
  { endpoint, params, patch, forPrepare }: CheckedQuery,
  index: number,
  place: string,
): { readonly query: CompiledQuery; readonly params: ParamsFormula | undefined } => ({
  query: Object.freeze({
    name,
    label: `${prefix} query${place}`,
    index,
    endpoint,
    patch,
    forPrepare,
  }),
  params:
    params === undefined
      ? undefined
      : Object.freeze({
          kind: "query",
          name,
          address: name,
          label: `${prefix} query.params${place}`,
          formula: params,
          row: undefined,
        }),
});
