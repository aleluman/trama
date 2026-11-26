// The declarations of a section of rules: each property of each entry, checked
// once and kept in the order written. defineForm checks its own rules here,
// and defineRules those of a rule set, which every form that includes it
// places in its sequence.
import { fieldAt, isPlainRecord, remote, type FieldDefinition } from "./fields.js";
import { hasState, isLimit, isStateProperty, stateKinds } from "./state-properties.js";
import type { Fields } from "./definition.js";
import { fieldLabel, templateLabel } from "./address.js";
import { checkQuery, type CheckedQuery } from "./params.js";
import type { RuleFormula } from "./reads.js";
import type { EndpointTable } from "./compiled.js";
import type { Owner } from "./remote-fields.js";
import type { Own } from "./rules.js";
import { relationOf } from "./relations.js";

// What a form takes of each property of a field: one declaration in the whole
// form, or contributions from every place, which combine in the order of the
// sequence. Every state property accumulates.
const accumulated = Object.fromEntries(
  Object.keys(stateKinds).map((property) => [property, "accumulate"]),
) as { readonly [P in keyof typeof stateKinds]: "accumulate" };
export const policies = {
  value: "single",
  relation: "single",
  onChange: "single",
  onEdit: "single",
  params: "single",
  query: "single",
  ...accumulated,
  states: "accumulate",
} as const;
export type Property = keyof typeof policies;

export const eventConflict = (label: string, first: string, second: string) =>
  new Error(`${label}: ${first} and ${second}; a field declares onChange or onEdit, not both`);

// A property of a field of the header or of the rows of a collection: a
// query, the members of a relation, or the functions of any other property,
// each with the suffix of its position in an array.
export type Declaration = {
  readonly collection: string | undefined;
  readonly name: string;
  readonly label: string;
  // The scope of a message of rows or of a collection, which names no field.
  readonly own?: Own | undefined;
  readonly drivenBy?: string | undefined;
} & (
  | { readonly property: "query"; readonly query: CheckedQuery }
  | { readonly property: "relation"; readonly members: readonly string[] }
  | {
      readonly property: Exclude<Property, "query" | "relation">;
      readonly formulas: readonly (readonly [suffix: string, formula: RuleFormula])[];
    }
);
type Collection = { readonly name: string; readonly fields: Fields };

// Each entry names a field or a collection, whose each names its fields. The
// rules of a form may be undefined; those of a rule set may not.
export const declarationsOf = (
  owner: Owner,
  fields: Fields,
  collections: ReadonlyMap<string, Collection>,
  rules: unknown,
  table: EndpointTable | undefined,
): readonly Declaration[] => {
  if (!isPlainRecord(rules) && (owner !== "Form" || rules !== undefined))
    throw new Error(`${owner} rules must be an object keyed by field`);
  const prefix = owner === "Form" ? "Rules" : "Rule set rules";
  const declared: Declaration[] = [];
  for (const [name, entry] of Object.entries(rules ?? {})) {
    const collection = collections.get(name);
    if (collection !== undefined) {
      declared.push(
        ...eachOf(owner, `${prefix} of collection "${name}"`, collection, entry, table),
      );
      continue;
    }
    const item = fieldAt(fields, name);
    if (item === undefined) throw new Error(`${prefix}: unknown field "${name}"`);
    declared.push(...entryOf(owner, undefined, name, fieldLabel(name), fields, item, entry, table));
  }
  return Object.freeze(declared);
};

const eachOf = (
  owner: Owner,
  prefix: string,
  collection: Collection,
  entry: unknown,
  table: EndpointTable | undefined,
) => {
  if (entry === undefined) return [];
  if (!isPlainRecord(entry))
    throw new Error(`${prefix}: expected an object with each, row or collection`);
  for (const key of Object.keys(entry))
    if (key !== "each" && key !== "row" && key !== "collection")
      throw new Error(`${prefix}: unknown property "${key}"`);
  const { name: of } = collection;
  const own = [
    ...messagesOf(
      `Row of "${of}"`,
      `Row rules of "${of}"`,
      { kind: "row", collection: of },
      entry.row,
    ),
    ...messagesOf(
      `Collection "${of}"`,
      `Collection rules of "${of}"`,
      { kind: "collection", collection: of },
      entry.collection,
    ),
  ];
  const each = entry.each;
  if (each === undefined) return own;
  if (!isPlainRecord(each)) throw new Error(`${prefix} each: expected an object keyed by field`);
  return [
    ...own,
    ...Object.entries(each).flatMap(([name, rules]) => {
      const item = fieldAt(collection.fields, name);
      if (item === undefined) throw new Error(`${prefix} each: unknown field "${name}"`);
      const label = templateLabel(name, collection.name);
      return entryOf(owner, collection.name, name, label, collection.fields, item, rules, table);
    }),
  ];
};

// The messages of the rows of a collection, or of the collection: an object
// with error and warning, each a formula or an array of them. A message of rows
// compiles where the fields of the rows do; one of the collection, in the
// header.
export const messagesOf = (
  label: string,
  rules: string,
  own: Own,
  declared: unknown,
): Extract<Declaration, { readonly formulas: unknown }>[] => {
  if (declared === undefined) return [];
  if (!isPlainRecord(declared))
    throw new Error(`${rules}: expected an object with error or warning`);
  for (const key of Object.keys(declared))
    if (key !== "error" && key !== "warning")
      throw new Error(`${rules}: unknown property "${key}"`);
  return Object.entries(declared)
    .filter(([, formulas]) => formulas !== undefined)
    .map(([property, formulas]) =>
      Object.freeze({
        collection: own.kind === "row" ? own.collection : undefined,
        name: "",
        label,
        own,
        property: property as "error" | "warning",
        formulas: functionsOf(`${label} ${property}`, property, formulas),
      }),
    );
};

// The properties an entry declares, without those left undefined: every name
// is checked first, then each property in the order written.
const entryOf = (
  owner: Owner,
  collection: string | undefined,
  name: string,
  label: string,
  fields: Fields,
  item: FieldDefinition,
  entry: unknown,
  table: EndpointTable | undefined,
): Declaration[] => {
  if (entry === undefined) return [];
  if (!isPlainRecord(entry)) throw new Error(`${label} rules: expected an object of properties`);
  for (const property of Object.keys(entry)) checkProperty(label, item, property);
  const entries = Object.entries(entry).filter(([, value]) => value !== undefined);
  // A rule set rejects its own conflict of events; a form, when it compiles.
  if (owner === "Rule set") {
    const events = entries.filter(([property]) => property === "onChange" || property === "onEdit");
    if (events.length > 1)
      throw eventConflict(label, `${events[0]?.[0]} in rules`, `${events[1]?.[0]} in rules`);
  }
  return entries.flatMap(([property, declared]): Declaration[] =>
    property === "relation"
      ? relationOf({ collection, name, label }, item, declared, fields)
      : [
          Object.freeze(
            property === "query"
              ? {
                  collection,
                  name,
                  label,
                  property,
                  query: checkQuery(label, declared, table, owner),
                }
              : {
                  collection,
                  name,
                  label,
                  property: property as Exclude<Property, "query" | "relation">,
                  formulas: functionsOf(`${label} ${property}`, property, declared),
                },
          ),
        ],
  );
};

// The placeholder, the limits and params exist only in the field types that
// declare them.
const checkProperty = (label: string, item: FieldDefinition, property: string) => {
  if (!Object.hasOwn(policies, property))
    throw new Error(`${label} rules: unknown property "${property}"`);
  if (isStateProperty(property) && !hasState(item.type, property))
    throw new Error(`${label} ${property}: ${item.type} fields have no ${property}`);
  if (property === "params" && !remote(item))
    throw new Error(`${label} params: ${item.type} fields have no params`);
};

// A flag takes a formula or an array of formulas, each named by its position;
// every other property, as a text or a limit, takes one function.
const functionsOf = (prefix: string, property: string, declared: unknown) => {
  if (typeof declared === "function") return [["", declared as RuleFormula] as const];
  const kind = property === "onChange" || property === "onEdit" ? "event" : "formula";
  if (!isStateProperty(property) || stateKinds[property] === "text" || isLimit(property))
    throw new Error(`${prefix}: ${kind} must be a function`);
  if (!Array.isArray(declared))
    throw new Error(`${prefix}: expected a formula or an array of formulas`);
  return Array.from(declared, (item: unknown, index) => {
    if (typeof item !== "function")
      throw new Error(`${prefix}[${index}]: formula must be a function`);
    return [`[${index}]`, item as RuleFormula] as const;
  });
};

type Claim = {
  readonly property: Declaration["property"];
  readonly drivenBy: string | undefined;
  readonly place: string;
};
export type Claims = Map<string, Claim>;

// A value, relation, params or query claims its property; onEdit and onChange
// share the key of the field's event. Generated writers carry their driver
// so a conflict names the declaration that reserved the property.
export const claim = (
  claimed: Claims,
  { name, label, property, drivenBy }: Declaration,
  place: string,
) => {
  if (policies[property] !== "single") return;
  const key = `${property === "onEdit" ? "onChange" : property}:${name}`;
  const next = { property, place, drivenBy };
  const first = claimed.get(key);
  if (first !== undefined) throw conflict(label, first, next);
  claimed.set(key, next);
};

const conflict = (label: string, first: Claim, next: Claim): Error => {
  if (first.drivenBy !== undefined || next.drivenBy !== undefined)
    return relationConflict(label, first, next);
  if (first.property !== next.property)
    return eventConflict(
      label,
      `${first.property} in ${first.place}`,
      `${next.property} in ${next.place}`,
    );
  return new Error(`${label} ${next.property}: declared by ${first.place} and ${next.place}`);
};

const relationAt = ({ drivenBy, place }: Claim) => `the relation of "${drivenBy}" in ${place}`;
const relationConflict = (label: string, first: Claim, next: Claim): Error => {
  if (first.drivenBy !== undefined && next.drivenBy !== undefined)
    return new Error(
      `${label}: member of ${relationAt(first)} and of ${relationAt(next)}; a field is a member of one relation`,
    );
  const [member, relation] = first.drivenBy === undefined ? [first, next] : [next, first];
  return new Error(
    `${label} ${member.property} in ${member.place}: ${relationAt(relation)} takes the value and the events of its members`,
  );
};

// A rule set with a relation rejects the conflicts between its entries when
// it is defined; a form, those between its sources when it compiles. Without
// a relation, an entry cannot conflict with another.
export const checkSetClaims = (declarations: readonly Declaration[]) => {
  if (!declarations.some(({ property }) => property === "relation")) return;
  const scopes = new Map<string | undefined, Claims>();
  for (const declaration of declarations) {
    const { collection } = declaration;
    let claimed = scopes.get(collection);
    if (claimed === undefined) {
      claimed = new Map();
      scopes.set(collection, claimed);
    }
    claim(claimed, declaration, "rules");
  }
};
