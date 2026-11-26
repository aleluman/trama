// Subtypes: a field specialized on a base type, with its own renderer and a
// static presentation. An application declares them once, in createForms; a
// field of a subtype keeps the value, the rules and the state of its base.
import { describe, isPlainRecord, type PlainRecord } from "./data.js";
import type { EndpointTable } from "./compiled.js";
import { fieldTypeNames, isFieldType } from "./field-traits.js";
import { checkOrder, presentationOf, type FieldDefinition } from "./fields.js";
import { unbound, type Owner } from "./remote-fields.js";

type Base = FieldDefinition["type"];
// What subtype.<base>() returns, recognized by identity: its presentation
// exists only in types. The result is an object type without an alias, so
// the declarations of a consumer that exports a descriptor print it whole.
const descriptors = new WeakSet<object>();
export const subtype = Object.freeze(
  Object.fromEntries(
    fieldTypeNames.map((base) => [
      base,
      () => {
        const descriptor = Object.freeze({ base });
        descriptors.add(descriptor);
        return descriptor;
      },
    ]),
  ),
) as unknown as {
  readonly [B in Base]: <O extends PlainRecord = {}>() => {
    readonly base: B;
    readonly presentation?: O;
  };
};

// A subtype in one createForms, whose table of endpoints identifies it. Each
// field its factory creates is marked with an opaque token of it: a symbol
// key survives spreads and the copies of the definitions, and JSON drops it.
// Only this module knows what a token stands for, so a mark read by
// reflection can be copied but not forged, nor reach the table.
type Entry = { readonly name: string; readonly base: Base; readonly table: EndpointTable };
const entries = new WeakMap<object, Entry>();
const mark = Symbol("trama.subtype");
type Marked = { readonly subtype?: unknown; readonly [mark]?: unknown };
const marked = (item: Record<string, unknown>, name: string, token: object) => ({
  ...item,
  subtype: name,
  ...(item.presentation === undefined
    ? undefined
    : {
        presentation: presentationOf(item.presentation, `Subtype "${name}": presentation`),
      }),
  [mark]: token,
});

// The factories of the subtypes that createForms declares, by name: each one
// is the factory of its base, given the field of createForms, and marks what it
// creates. A remote one checks its endpoint before the presentation.
export const subtypeFields = (
  declared: unknown,
  table: EndpointTable,
  factories: Readonly<Record<Base, unknown>>,
) => {
  if (declared === undefined) return {};
  if (!isPlainRecord(declared))
    throw new Error("createForms: subtypes must be an object of subtypes");
  return Object.fromEntries(
    Object.entries(declared).map(([name, value]) => {
      const at = `Subtype "${name}"`;
      if (isFieldType(name)) throw new Error(`${at} has the name of a field type`);
      checkOrder(at, name);
      if (typeof value !== "object" || value === null || !descriptors.has(value))
        throw new Error(`${at} must be created with subtype.<type>()`);
      const { base } = value as { readonly base: Base };
      const token = Object.freeze({});
      entries.set(token, { name, base, table });
      // The factory of the base takes the configuration of the subtype as is.
      const create = factories[base] as (...config: unknown[]) => Record<string, unknown>;
      return [name, (...config: unknown[]) => marked(create(...config), name, token)];
    }),
  );
};

// A field of a subtype enters only the forms and rule sets of the createForms
// whose factory created it, with its name and its base: table is that of the
// form or the set, undefined in the core.
export const admit = (
  item: FieldDefinition,
  table: EndpointTable | undefined,
  label: string,
  owner: Owner,
) => {
  const { subtype: name, [mark]: token } = item as Marked;
  if (name === undefined && token === undefined) return item;
  const at = `${label} (subtype ${describe(name)})`;
  if (table === undefined) throw new Error(`${at}: ${unbound(owner)}`);
  const entry = typeof token === "object" && token !== null ? entries.get(token) : undefined;
  if (entry?.table !== table || entry.name !== name || entry.base !== item.type)
    throw new Error(`${at} belongs to other forms`);
  return item;
};
