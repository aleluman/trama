// createForms joins the registries of an application once, and binds to them
// its defineForm, its defineRules and its fields.
import type { At, Keys, Verdict } from "./authoring-checks.js";
import { defineFormFor } from "./compile.js";
import { describe, isPlainRecord } from "./data.js";
import { endpointsOf, type BoundField, type Registry, type ResolvedEndpoint } from "./endpoints.js";
import { field, hasOnlyKeys, type FieldDefinition } from "./fields.js";
import { givesValue } from "./remote-fields.js";
import { defineRulesFor } from "./rule-sets.js";
import { subtypeFields } from "./subtypes.js";
import { checkMessages, type Messages } from "./messages.js";
import type { BoundDefineForm, BoundDefineRules, Subtypes } from "./subtype-types.js";

type EndpointsOf<G> = G extends Registry<infer E> ? E : never;
type KeysOf<G> = Keys<EndpointsOf<G>> & string;
// The endpoints of every registry of the tuple, by key.
export type Merged<R extends readonly Registry[]> = {
  [K in KeysOf<R[number]>]: At<EndpointsOf<R[number]>, K>;
};
// A key that two registries of the tuple declare.
type Repeated<R extends readonly unknown[]> = R extends readonly [infer H, ...infer T]
  ? (KeysOf<H> & KeysOf<T[number]>) | Repeated<T>
  : never;
type RepeatedMessage<R extends readonly unknown[]> =
  Repeated<R> extends infer K
    ? K extends string
      ? `Endpoint "${K}" is declared in two registries`
      : never
    : never;

// A subtype cannot take the name of a field type.
type NamedAsBase<S> =
  `Subtype "${Extract<keyof S, FieldDefinition["type"]>}" has the name of a field type`;

// The registries and the subtypes of an application are joined once. The
// definitions keep the key of each async field, and the defineForm and the
// defineRules of this call resolve it; they admit the fields of its
// subtypes, which its field creates. Its messages are the texts of the
// validation of its forms.
export const createForms = <
  const R extends readonly Registry[],
  const S extends Subtypes = {},
>(config: {
  readonly endpoints: R & NoInfer<Verdict<RepeatedMessage<R>>>;
  readonly subtypes?: (S & NoInfer<Verdict<NamedAsBase<S>>>) | undefined;
  readonly messages?: Partial<Messages> | undefined;
}): {
  readonly defineForm: BoundDefineForm<Merged<R>, S>;
  readonly defineRules: BoundDefineRules<Merged<R>, S>;
  readonly field: BoundField<Merged<R>, S>;
} => {
  const declared: unknown = isPlainRecord(config) ? config.endpoints : undefined;
  if (!hasOnlyKeys(config, ["endpoints", "subtypes", "messages"]) || !Array.isArray(declared))
    throw new Error("createForms requires endpoints: an array of registries");
  const messages = checkMessages(config.messages);
  const table = new Map<string, ResolvedEndpoint>();
  for (const registry of declared as unknown[]) {
    const found = endpointsOf(registry);
    if (found === undefined)
      throw new Error("createForms requires endpoints: an array of registries");
    for (const [key, resolved] of found) {
      if (table.has(key)) throw new Error(`Endpoint "${key}" is declared in two registries`);
      table.set(key, resolved);
    }
  }
  // A remote field of either cardinality takes a key of the registry.
  const remoteOf =
    (type: string) =>
    (key: unknown, options: object = {}) => {
      const found = typeof key === "string" ? table.get(key) : undefined;
      if (found === undefined) throw new Error(`Unknown endpoint ${describe(key)}`);
      if (found.kind === "value") throw new Error(`Endpoint "${found.key}" ${givesValue}`);
      return { ...options, type, endpoint: key };
    };
  const factories = { ...field, async: remoteOf("async"), multiAsync: remoteOf("multiAsync") };
  const subtyped = subtypeFields(config.subtypes, table, factories);
  return Object.freeze({
    defineForm: defineFormFor(table, messages) as BoundDefineForm<Merged<R>, S>,
    defineRules: defineRulesFor(table) as BoundDefineRules<Merged<R>, S>,
    field: Object.freeze({ ...factories, ...subtyped }) as unknown as BoundField<Merged<R>, S>,
  });
};
