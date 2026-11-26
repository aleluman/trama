// Rule sets: rules defined apart, with the fields, collections and context
// they require, which forms include. defineRules checks them once and keeps
// their declarations; each form that includes a set places them in its
// sequence and compiles them as its own.
import { fieldAt, hasOnlyKeys, remote, type FieldDefinition } from "./fields.js";
import type { Fields } from "./definition.js";
import { checkDeclared, type CompiledCollection } from "./collections.js";
import { checkSetClaims, declarationsOf, type Declaration } from "./declarations.js";
import { unbound } from "./remote-fields.js";
import type { EndpointTable } from "./compiled.js";
import type { Source } from "./rules.js";
import { checkDriver } from "./relations.js";
import type { DefineRules } from "./rule-set-config.js";

// What a set requires of a field: its type and, of an async field, its
// endpoint. Its label, its default and the options of a select belong to the
// form that includes it, which checks the options of a driver against the
// members of its relation (checkDrivers).
type Requirement = { readonly type: string; readonly endpoint: string | undefined };
type Requirements = ReadonlyMap<string, Requirement>;
// What a set keeps: the registry of its createForms, undefined for the core;
// what it requires; and its declarations, in the order written.
type Held = {
  readonly table: EndpointTable | undefined;
  readonly fields: Requirements;
  readonly collections: ReadonlyMap<string, Requirements>;
  readonly context: boolean;
  readonly declarations: readonly Declaration[];
};
const held = new WeakMap<object, Held>();
const sections = ["fields", "collections", "context", "rules"];

export const defineRulesFor =
  (table?: EndpointTable) =>
  (config: unknown): object => {
    if (!hasOnlyKeys(config, sections))
      throw new Error(
        "Rule set configuration requires rules and optional fields/collections/context",
      );
    const { fields, collections } = checkDeclared(
      "Rule set",
      config.fields === undefined ? {} : config.fields,
      config.collections,
      config.context,
      table,
    );
    const declarations = declarationsOf(
      "Rule set",
      fields,
      collections.checked,
      config.rules,
      table,
    );
    checkSetClaims(declarations);
    const set = Object.freeze({});
    held.set(set, {
      table,
      fields: requirementsOf(fields),
      collections: new Map(
        Array.from(collections.checked, ([name, { fields: row }]) => [name, requirementsOf(row)]),
      ),
      context: config.context !== undefined,
      declarations,
    });
    return set;
  };
const requirementsOf = (fields: Fields): Requirements =>
  new Map(
    Object.entries(fields).map(([name, item]) => [
      name,
      { type: item.type, endpoint: remote(item) ? item.endpoint : undefined },
    ]),
  );
export const defineRules = defineRulesFor() as DefineRules<undefined>;

// The form an include belongs to: what it has to give the sets it includes.
type Receiver = {
  readonly fields: Fields;
  readonly collections: ReadonlyMap<string, CompiledCollection>;
  readonly context: boolean;
  readonly table: EndpointTable | undefined;
};
// The sequence of a form: the rule sets of include, in order, then its own
// rules, without a place.
export const sourcesOf = (include: unknown, rules: unknown, form: Receiver): Source[] => [
  ...includedSources(include, form),
  {
    place: undefined,
    declarations: declarationsOf("Form", form.fields, form.collections, rules, form.table),
  },
];
// Each element of include, in the order written, is a set or false, null or
// undefined, which are skipped; each set is checked as one: whether it
// repeats, its registry, the fields and collections it requires and its
// context. The first error stops. A set gives its declarations at its place.
const includedSources = (include: unknown, form: Receiver): Source[] => {
  if (include === undefined) return [];
  if (!Array.isArray(include)) throw new Error("Form include must be an array of rule sets");
  const seen = new Map<object, number>();
  const sources: Source[] = [];
  for (const [index, element] of (include as unknown[]).entries()) {
    if (element === false || element === null || element === undefined) continue;
    const at = `Form include[${index}]`;
    const set = typeof element === "object" ? held.get(element) : undefined;
    if (set === undefined) throw new Error(`${at}: expected a rule set, false, null or undefined`);
    const first = seen.get(element as object);
    if (first !== undefined) throw new Error(`${at}: repeats the rule set of include[${first}]`);
    seen.set(element as object, index);
    checkSet(`${at}: rule set`, set, form);
    checkDrivers(set.declarations, form, `include[${index}]`);
    sources.push({ place: `include[${index}]`, declarations: set.declarations });
  }
  return sources;
};

// The set has already checked its own definitions. A select in the receiving
// form has its own options, so those also have to match the relation.
const checkDrivers = (declarations: readonly Declaration[], form: Receiver, place: string) => {
  for (const declaration of declarations) {
    if (declaration.property !== "relation") continue;
    const { collection, name, label, members } = declaration;
    const fields =
      collection === undefined ? form.fields : form.collections.get(collection)?.fields;
    checkDriver(`${label} relation (${place})`, fields?.[name] as FieldDefinition, members);
  }
};

const checkSet = (at: string, set: Held, form: Receiver) => {
  if (set.table !== undefined && set.table !== form.table)
    throw new Error(
      form.table === undefined
        ? `${at} of createForms: ${unbound("Form")}`
        : `${at} of another createForms`,
    );
  requires(at, set.fields, form.fields, "");
  for (const [name, fields] of set.collections) {
    const collection = form.collections.get(name);
    if (collection === undefined) throw new Error(`${at} requires collection "${name}"`);
    requires(at, fields, collection.fields, ` of "${name}"`);
  }
  if (set.context && !form.context) throw new Error(`${at} requires a context`);
};
const requires = (
  at: string,
  required: Requirements,
  fields: Readonly<Record<string, FieldDefinition>>,
  of: string,
) => {
  for (const [name, { type, endpoint }] of required) {
    const item = fieldAt(fields, name);
    const field = `${at} requires field "${name}"${of}`;
    if (item === undefined) throw new Error(field);
    if (item.type !== type) throw new Error(`${field} of type ${type}, not ${item.type}`);
    if (remote(item) && item.endpoint !== endpoint)
      throw new Error(`${field} with endpoint "${endpoint}", not "${item.endpoint}"`);
  }
};
