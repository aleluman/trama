// What a patch writes, as an event, a query or the application returned it:
// each name must be a field of its scope, and a value left undefined is not
// written. A patch of the form nests the rows it writes by collection and key.
import { accepts, fieldAt, isPlainRecord, problemOf, type FieldDefinition } from "./fields.js";
import { describe, ownEntries } from "./data.js";
import { rowAddress, type Field, type Row, type RowKey } from "./address.js";
import type { CompiledCollection } from "./collections.js";

type Entries = readonly (readonly [PropertyKey, unknown])[];
// A record of a patch, read once: its own entries.
type Read = { readonly entries: Entries };
const records = new WeakSet<Read>();
const recordOf = (entries: Entries): Read => {
  const read = { entries };
  records.add(read);
  return read;
};

// Reads a patch whole, while its rule owns it, so a getter that throws fails
// the rule: its entries and, under each collection, those of every row.
export const readPatch = (patch: object, collections?: ReadonlyMap<string, unknown>): Entries => {
  const entries = ownEntries(patch);
  if (collections === undefined || collections.size === 0) return entries;
  return entries.map(([key, value]) =>
    typeof key === "string" && collections.has(key) && isPlainRecord(value)
      ? [
          key,
          recordOf(
            ownEntries(value).map(([row, fields]) => [
              row,
              isPlainRecord(fields) ? recordOf(ownEntries(fields)) : fields,
            ]),
          ),
        ]
      : [key, value],
  );
};

// The header fields a patch writes. A patch of a query cannot write rows.
export const checkPatch = (
  prefix: string,
  fields: Readonly<Record<string, FieldDefinition>>,
  found: Iterable<readonly [PropertyKey, unknown]>,
  collections?: ReadonlyMap<string, unknown>,
): Map<string, unknown> => {
  const patch = new Map<string, unknown>();
  for (const [key, value] of found) {
    if (typeof key === "string" && collections?.has(key) === true)
      throw new Error(`${prefix}: patches cannot write collection "${key}"`);
    write(prefix, fields, key, value, (name, written) => patch.set(name, written));
  }
  return patch;
};

// The fields of its own row that a patch of a row writes.
export const rowPatch = (prefix: string, row: Row, found: Entries) => {
  const patch = new Map<Field, unknown>();
  for (const [key, value] of found)
    write(prefix, row.collection.fields, key, value, (name, written) =>
      patch.set(rowAddress(row, name), written),
    );
  return patch;
};

// The fields a patch of the form writes, read by readPatch: header fields, and
// rows of each collection by key, which rows finds among the current ones.
// An unknown key fails even if its patch is undefined.
export const formPatch = (
  prefix: string,
  fields: Readonly<Record<string, FieldDefinition>>,
  collections: ReadonlyMap<string, CompiledCollection>,
  rows: Rows | undefined,
  found: Entries,
  unknownKey: (key: PropertyKey, collection: string) => string = (key, collection) =>
    `${prefix}: unknown row key ${describe(key)} in collection "${collection}"`,
): Map<Field, unknown> => {
  if (collections.size === 0) return checkPatch(prefix, fields, found);
  const patch = new Map<Field, unknown>();
  const set = (address: Field, written: unknown) => patch.set(address, written);
  for (const [key, value] of found) {
    const collection = typeof key === "string" ? collections.get(key) : undefined;
    if (collection === undefined) {
      write(prefix, fields, key, value, set);
      continue;
    }
    if (value === undefined) continue;
    if (!records.has(value as Read))
      throw new Error(
        `${prefix}: collection "${collection.name}" in patch must be an object keyed by row`,
      );
    for (const [rowKey, rowValue] of (value as Read).entries) {
      const row = typeof rowKey === "string" ? rows?.row(collection, rowKey as RowKey) : undefined;
      if (row === undefined) throw new Error(unknownKey(rowKey, collection.name));
      if (rowValue === undefined) continue;
      const at = `${prefix}: row "${row.key}" of "${collection.name}"`;
      if (!records.has(rowValue as Read))
        throw new Error(`${at}: expected a patch object, got ${describe(rowValue)}`);
      for (const [name, written] of (rowValue as Read).entries)
        write(at, collection.fields, name, written, (field, accepted) =>
          set(rowAddress(row, field), accepted),
        );
    }
  }
  return patch;
};

const write = (
  prefix: string,
  fields: Readonly<Record<string, FieldDefinition>>,
  key: PropertyKey,
  value: unknown,
  set: (name: string, value: unknown) => void,
) => {
  const item = fieldAt(fields, key);
  if (item === undefined) throw new Error(`${prefix}: unknown field ${describe(key)} in patch`);
  if (value === undefined) return;
  if (!accepts(item, value)) throw incompatibleValue(prefix, item, key as string, value);
  set(key as string, value);
};

// A value that a patch or the defaults give to a field that does not accept it.
export const incompatibleValue = (
  prefix: string,
  item: FieldDefinition,
  name: string,
  value: unknown,
) => {
  const problem = problemOf(item, value);
  return new Error(
    problem === undefined
      ? `${prefix}: incompatible value ${describe(value)} for ${item.type} field "${name}"`
      : `${prefix}: incompatible value for ${item.type} field "${name}": ${problem}`,
  );
};

// A patch of the session has the meaning of an edit of every field it writes.
export const sessionPatch = (
  fields: Readonly<Record<string, FieldDefinition>>,
  collections: ReadonlyMap<string, CompiledCollection>,
  patch: unknown,
  rows: Rows,
  prefix = "Patch",
  unknownKey?: (key: PropertyKey, collection: string) => string,
) => {
  if (!isPlainRecord(patch))
    throw new Error(`${prefix}: expected a patch object, got ${describe(patch)}`);
  return formPatch(prefix, fields, collections, rows, readPatch(patch, collections), unknownKey);
};
// The canonical values of a commit, with the shape of session.patch: fields of
// the header and, by key, fields of the rows the prepared held.
export const canonicalPatch = (
  fields: Readonly<Record<string, FieldDefinition>>,
  collections: ReadonlyMap<string, CompiledCollection>,
  canonical: unknown,
  rows: Rows,
): ReadonlyMap<Field, unknown> =>
  canonical === undefined
    ? new Map()
    : sessionPatch(
        fields,
        collections,
        canonical,
        rows,
        "commit",
        (key, collection) => `commit: key ${describe(key)} of "${collection}" was not in prepared`,
      );
// Where a patch finds the rows it writes: those of the candidate or of the store.
type Rows = { row(collection: CompiledCollection, key: RowKey): Row | undefined };
