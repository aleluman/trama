// What the commands of a session take, checked whole before the engine runs
// anything: a collection, keys of its current rows, positions, and rows of
// values, each an object of fields of the collection with values they accept.
import type { Row, RowKey } from "./address.js";
import { unknownCollection, type CompiledCollection } from "./collections.js";
import { describe, ownEntries } from "./data.js";
import { adopt, fieldAt, isPlainRecord } from "./fields.js";
import { incompatibleValue } from "./patches.js";
import { accepts } from "./fields.js";
import type { Store } from "./tree.js";

type Values = Record<string, unknown>;
// A row to create: its values, defaults first, and the fields it was given,
// which prevail over its formulas.
export type NewRow = { readonly values: Values; readonly supplied: ReadonlySet<string> };

export const collectionOf = (
  collections: ReadonlyMap<string, CompiledCollection>,
  name: unknown,
): CompiledCollection => {
  const found = typeof name === "string" ? collections.get(name) : undefined;
  if (found === undefined) throw unknownCollection(name);
  return found;
};

// The current row of a key in a collection of the store, if any.
export const rowIn = (store: Store, collection: CompiledCollection, key: unknown) =>
  typeof key === "string"
    ? store.collections.get(collection.name)?.rows.get(key as RowKey)
    : undefined;

// A key of a current row of the collection; a key of another collection or of
// another session is unknown as well.
export const rowOf = (store: Store, collection: CompiledCollection, key: unknown): Row => {
  const row = rowIn(store, collection, key);
  if (row === undefined)
    throw new Error(`Collection "${collection.name}": unknown row key ${describe(key)}`);
  return row;
};

// An integer from 0 to max.
export const positionOf = (label: string, position: unknown, max: number) => {
  if (!Number.isInteger(position))
    throw new Error(`${label}: position must be an integer, got ${describe(position)}`);
  if ((position as number) < 0 || (position as number) > max)
    throw new Error(`${label}: position ${position as number} is out of range 0..${max}`);
  return position as number;
};

// The rows of an add or of the initial values, labeled with their index.
export const newRows = (collection: CompiledCollection, label: string, rows: unknown) => {
  if (!Array.isArray(rows)) throw new Error(`${label}: rows must be an array`);
  return Array.from(rows as unknown[], (row, index) =>
    newRow(collection, `${label}[${index}]`, row),
  );
};

const newRow = (collection: CompiledCollection, label: string, row: unknown): NewRow => {
  if (!isPlainRecord(row)) throw new Error(`${label}: expected an object of field values`);
  const values: Values = { ...collection.fieldDefaults };
  const supplied = new Set<string>();
  for (const [key, value] of ownEntries(row)) {
    const item = fieldAt(collection.fields, key);
    if (item === undefined) throw new Error(`${label}: unknown field ${describe(key)}`);
    if (!accepts(item, value)) throw incompatibleValue(label, item, key as string, value);
    values[key as string] = adopt(item, value, []);
    supplied.add(key as string);
  }
  return { values, supplied };
};

// The options of an add: where its rows go, at the end by default.
export const insertionOf = (label: string, options: unknown, length: number) => {
  if (options === undefined) return length;
  if (!isPlainRecord(options)) throw new Error(`${label}: options must be an object`);
  for (const key of Object.keys(options))
    if (key !== "at") throw new Error(`${label}: unknown option "${key}"`);
  return options.at === undefined ? length : positionOf(label, options.at, length);
};
