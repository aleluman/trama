// The collections of a form: each one declares the fields of its rows, which
// compile with the functions of the fields of the form, and the each of its
// rules compiles to templates that every row instantiates when it needs them.
// The async fields of its rows take their endpoints from the same registry as
// those of the header.
import { defineOwn, describe } from "./data.js";
import {
  defaultsOf,
  fieldAt,
  isPlainRecord,
  isRecord,
  checkField,
  checkOrder,
  type FieldDefinition,
} from "./fields.js";
import {
  fieldLabel,
  instanceOf,
  rowAddress,
  templateLabel,
  type Row,
  type StructureAddress,
} from "./address.js";
import type { EndpointTable } from "./compiled.js";
import type { CompiledQuery, ParamsFormula } from "./params.js";
import { resolveEndpoints, type Owner } from "./remote-fields.js";
import { admit } from "./subtypes.js";
import { declaration, type Fields } from "./definition.js";
import type { FieldEvent, FieldFormula, StateFormula } from "./rules.js";
import { declaredStates, type States } from "./states.js";

export type CompiledCollection = {
  readonly name: string;
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  readonly structure: StructureAddress;
  // Its place among the collections, the position of each field in a row and
  // the width of a row, which give the positions of its fields in the
  // traversal.
  readonly index: number;
  readonly positions: ReadonlyMap<string, number>;
  readonly width: number;
  // The fields as own keys, which the views of its rows answer.
  readonly shape: object;
  // The default of each field, or the empty of its type; toDefaults gives it.
  readonly fieldDefaults: Readonly<Record<string, unknown>>;
  readonly declared: States;
  // The endpoint of each async field of its rows.
  readonly endpoints: EndpointTable;
  // The templates of its rules, which the rules of the form fill in: those
  // of params are of async fields and of queries, which each row asks for.
  readonly formulas: Map<string, FieldFormula>;
  readonly events: Map<string, FieldEvent>;
  readonly states: StateFormula[];
  // The templates of the messages of each row.
  readonly own: StateFormula[];
  readonly params: ParamsFormula[];
  readonly queries: Map<string, CompiledQuery>;
};

// What a form or a rule set declares, checked in this order: its fields, each
// one and its endpoint, its collections and the mark of its context. owner
// names it in the diagnostics.
export const checkDeclared = (
  owner: Owner,
  fields: unknown,
  collections: unknown,
  context: unknown,
  table: EndpointTable | undefined,
) => {
  if (!isRecord(fields)) throw new Error(`${owner} fields must be an object`);
  // Each field is checked, then admitted in the forms of table, under label.
  const check: Check = (name, item, label) =>
    admit(checkField(name, item, label), table, label, owner);
  const copy: Fields = Object.fromEntries(
    Object.entries(fields).map(([name, item]) => [name, check(name, item, fieldLabel(name))]),
  );
  const endpoints = resolveEndpoints(copy, table, fieldLabel, owner);
  const checked = checkCollections(collections, copy, table, check, owner);
  if (context !== undefined && context !== declaration)
    throw new Error(`${owner} context must be declared with declareContext<T>()`);
  return { fields: copy, endpoints, collections: checked };
};

type Check = (name: string, item: unknown, label: string) => FieldDefinition;
// A collection as checked: the copy of the fields of its rows and the
// endpoint of each async one.
type Checked = {
  readonly name: string;
  readonly fields: Fields;
  readonly endpoints: EndpointTable;
};
// A section of collections, as defineForm or defineRules receives it: its
// definition, frozen, and each collection checked. Fields and collections
// never share a name.
const checkCollections = (
  declared: unknown,
  fields: Readonly<Record<string, FieldDefinition>>,
  table: EndpointTable | undefined,
  check: Check,
  owner: Owner,
) => {
  const checked = new Map<string, Checked>();
  if (declared === undefined) return { checked, definition: Object.freeze({}) };
  if (!isPlainRecord(declared))
    throw new Error(`${owner} collections must be an object keyed by collection`);
  const definition: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(declared)) {
    const copy = compileFields(name, entry, fields, check);
    const label = (field: string) => templateLabel(field, name);
    checked.set(name, {
      name,
      fields: copy,
      endpoints: resolveEndpoints(copy, table, label, owner),
    });
    Object.defineProperty(definition, name, {
      value: Object.freeze({ fields: copy }),
      enumerable: true,
    });
  }
  return { checked, definition: Object.freeze(definition) };
};
// The collections of a form compiled, in declaration order.
export const compileCollections = (checked: ReadonlyMap<string, Checked>) =>
  new Map(
    Array.from(checked.values(), ({ name, fields, endpoints }, index) => [
      name,
      compileCollection(name, fields, endpoints, index),
    ]),
  );

const compileFields = (
  name: string,
  entry: unknown,
  fields: Readonly<Record<string, FieldDefinition>>,
  check: Check,
) => {
  const prefix = `Collection "${name}"`;
  checkOrder(prefix, name);
  if (fieldAt(fields, name) !== undefined)
    throw new Error(`Name "${name}" is declared in fields and collections`);
  if (!isPlainRecord(entry)) throw new Error(`${prefix}: expected { fields }`);
  for (const key of Object.keys(entry))
    if (key !== "fields") throw new Error(`${prefix}: unknown property "${key}"`);
  const declared = entry.fields;
  if (declared === undefined) throw new Error(`${prefix} must declare fields`);
  if (!isRecord(declared)) throw new Error(`${prefix}: fields must be an object`);
  const copy: Record<string, FieldDefinition> = {};
  for (const [field, item] of Object.entries(declared))
    Object.defineProperty(copy, field, {
      value: check(field, item, templateLabel(field, name)),
      enumerable: true,
    });
  return Object.freeze(copy);
};

const compileCollection = (
  name: string,
  fields: Readonly<Record<string, FieldDefinition>>,
  endpoints: EndpointTable,
  index: number,
): CompiledCollection => {
  const names = Object.keys(fields);
  const collection = {
    name,
    fields,
    index,
    positions: positionsOf(names),
    width: 2 * names.length,
    shape: shapeOf(names),
    fieldDefaults: defaultsOf(fields),
    declared: declaredStates(fields),
    endpoints,
    formulas: new Map(),
    events: new Map(),
    states: [],
    own: [],
    params: [],
    queries: new Map(),
  } as Omit<CompiledCollection, "structure"> & { structure?: StructureAddress };
  collection.structure = Object.freeze({
    kind: "structure",
    collection: collection as CompiledCollection,
  });
  return collection as CompiledCollection;
};

// An object whose own keys are the names given, which a view answers with
// values. It is never frozen, so a view may answer them with anything.
export const shapeOf = (names: Iterable<string>) => {
  const shape = {};
  for (const name of names) defineOwn(shape, name);
  return shape;
};

// The position of each field in the traversal, 2i for the field at index i in
// declaration order: its event goes right after it, at 2i + 1.
export const positionsOf = (names: readonly string[]) =>
  new Map(names.map((name, at) => [name, 2 * at]));

// The instances of a row: its formula of value, its event and its params of a
// field, which take the address of the field, and each of its formulas of
// state, with the label of the row.
const fieldInstance = <T extends { readonly label: string }>(
  row: Row,
  field: string,
  template: T | undefined,
) =>
  template &&
  instanceOf(row, template, () =>
    located(row, field, { ...template, address: rowAddress(row, field) }),
  );
export const formulaOf = (row: Row, field: string) =>
  fieldInstance(row, field, row.collection.formulas.get(field));
export const eventOf = (row: Row, field: string) =>
  fieldInstance(row, field, row.collection.events.get(field));
export const paramsOf = (row: Row, template: ParamsFormula) =>
  fieldInstance(row, template.name, template) as ParamsFormula;
export const stateOf = (row: Row, template: StateFormula): StateFormula =>
  instanceOf(row, template, () =>
    template.own === undefined
      ? located(row, template.name as string, template)
      : Object.freeze({ ...template, label: ownLabel(row, template.label), row }),
  );
// A message of rows is labeled Row of "lines" error; its instance, with the key
// of its row after the collection.
const ownLabel = (row: Row, label: string) => {
  const scope = `Row of "${row.collection.name}"`;
  return `${scope} row "${row.key}"${label.slice(scope.length)}`;
};
// A template is labeled Field "amount" of "lines" value; its instance, with
// the key of its row after the collection.
export const rowLabel = (row: Row, name: string, label: string) =>
  `${fieldLabel(name, row)}${label.slice(templateLabel(name, row.collection.name).length)}`;
const located = <T extends { readonly label: string }>(row: Row, name: string, template: T) =>
  Object.freeze({ ...template, label: rowLabel(row, name, template.label), row });

export const unknownCollection = (name: unknown) =>
  new Error(`Unknown collection ${describe(name)}`);
