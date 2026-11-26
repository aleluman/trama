// The values of a session with collections: the header and, per collection,
// the keys in visual order, the rows in creation order and a frozen record per
// row, with structure shared between operations. A candidate copies a record
// only when it writes it, and commits arrays that keep their identity while
// their content does not change.
import type { Address, Row, RowKey } from "./address.js";
import { defineOwn } from "./data.js";
import type { CompiledCollection } from "./collections.js";
import type { Compiled } from "./compiled.js";
import type { Read } from "./reads.js";
import type { Source, Tree } from "./views.js";

type Values = Record<string, unknown>;
export type RowRecord = Readonly<Values>;
// The records of a collection in visual order, as the values publish them, and
// the position of each key among them, which only a change of its keys
// replaces: an edit copies an array of records, not a map.
export type Records = {
  readonly published: readonly RowRecord[];
  readonly at: ReadonlyMap<RowKey, number>;
};
export type Rows = {
  readonly order: readonly RowKey[];
  readonly created: readonly Row[];
  readonly rows: ReadonlyMap<RowKey, Row>;
  readonly records: Records;
};
// What a session publishes: values has the header and the array of each
// collection; collections, the rows of each one.
export type Store = {
  readonly values: Readonly<Values>;
  readonly collections: ReadonlyMap<string, Rows>;
};
// A candidate writes the header in a copy, and each row in a copy of its own.
// Its records are those of the store it comes from: a row it removes leaves its
// rows, so nothing reads that record.
export type Draft = Rows & { readonly written: Map<RowKey, Values> };
export type Candidate = {
  readonly values: Values;
  readonly collections: Map<string, Draft>;
};

export const noCollections: ReadonlyMap<string, Rows> = new Map();
// The drafts of a form without collections, which no operation changes.
const noDrafts = new Map<string, Draft>();

export const candidateOf = (store: Store): Candidate => {
  if (store.collections.size === 0) return { values: { ...store.values }, collections: noDrafts };
  const collections = new Map<string, Draft>();
  for (const [name, rows] of store.collections)
    collections.set(name, { ...rows, written: new Map() });
  return { values: { ...store.values }, collections };
};

// The record of a key, if its records have it.
export const recordIn = (records: Records, key: RowKey): RowRecord | undefined => {
  const at = records.at.get(key);
  return at === undefined ? undefined : records.published[at];
};

// The value at an address, without resolving it: a field of the header, of a
// row the candidate or the store holds, or the keys of a collection.
export const valueAt = (
  values: Readonly<Values>,
  collections: ReadonlyMap<string, Rows & { readonly written?: Map<RowKey, Values> }>,
  address: Address,
): unknown => {
  if (typeof address === "string") return values[address];
  if (address.kind === "structure") return collections.get(address.collection.name)?.order;
  const { row } = address;
  const rows = collections.get(row.collection.name);
  if (rows === undefined) return undefined;
  return (rows.written?.get(row.key) ?? recordIn(rows.records, row.key))?.[address.field];
};

// Writes a field of the candidate, copying the record of its row the first time.
export const writeAt = (candidate: Candidate, address: Address, value: unknown) => {
  if (typeof address === "string") {
    candidate.values[address] = value;
    return;
  }
  if (address.kind === "structure") throw new Error("The structure of a collection is no field");
  const { row } = address;
  const rows = candidate.collections.get(row.collection.name) as Draft;
  let record = rows.written.get(row.key);
  if (record === undefined) {
    record = { ...recordIn(rows.records, row.key) };
    rows.written.set(row.key, record);
  }
  record[address.field] = value;
};

// Whether a row is in the candidate or the store.
export const holds = (
  collections: ReadonlyMap<string, { readonly rows: ReadonlyMap<RowKey, Row> }>,
  row: Row,
) => collections.get(row.collection.name)?.rows.get(row.key) === row;

// The tree that views read: the shape of the form and the rows of the candidate
// or of the store.
export const treeOf = (
  shape: object,
  compiled: ReadonlyMap<string, CompiledCollection>,
  values: Readonly<Values>,
  collections: ReadonlyMap<string, Rows>,
): Tree => ({
  shape,
  collections: compiled,
  row: (collection, key) => collections.get(collection.name)?.rows.get(key),
  get: (address) => valueAt(values, collections, address),
});

// Freezes the candidate into the next store. A record written with the values
// it had is the same record; an array whose rows and order did not change is
// the same array.
export const commit = (candidate: Candidate, previous: Store): Store => {
  const { values } = candidate;
  if (candidate.collections.size === 0)
    return { values: Object.freeze(values), collections: noCollections };
  const collections = new Map<string, Rows>();
  for (const [name, { written, ...draft }] of candidate.collections) {
    const records =
      previous.collections.get(name)?.order === draft.order
        ? rewritten(draft.records, written)
        : reordered(draft.records, draft.order, written);
    collections.set(name, { ...draft, records });
    defineOwn(values, name, records.published);
  }
  return { values: Object.freeze(values), collections };
};

const sameRecord = (a: RowRecord, b: RowRecord) => {
  for (const key in a) if (!Object.is(a[key], b[key])) return false;
  return true;
};
// The same keys in the same order: only the records written with other values
// change, in a copy of the array. A spread copies a frozen array far faster
// than slice.
const rewritten = (records: Records, written: ReadonlyMap<RowKey, Values>): Records => {
  let published: RowRecord[] | undefined;
  for (const [key, record] of written) {
    const at = records.at.get(key) as number;
    if (sameRecord(records.published[at] as RowRecord, record)) continue;
    published ??= [...records.published];
    published[at] = Object.freeze(record);
  }
  return published === undefined
    ? records
    : { published: Object.freeze(published), at: records.at };
};
// Other keys or another order: every position again.
const reordered = (
  records: Records,
  order: readonly RowKey[],
  written: ReadonlyMap<RowKey, Values>,
): Records => {
  const at = new Map<RowKey, number>();
  const published = order.map((key, position) => {
    at.set(key, position);
    const base = recordIn(records, key);
    const record = written.get(key);
    return record === undefined || (base !== undefined && sameRecord(base, record))
      ? (base as RowRecord)
      : Object.freeze(record);
  });
  return { published: Object.freeze(published), at };
};

export const emptyStore: Store = { values: Object.freeze({}), collections: noCollections };

// Reads the values of a store by address.
export const readerOf =
  ({ values, collections }: Store): Read =>
  (address) =>
    typeof address === "string" ? values[address] : valueAt(values, collections, address);

// What rules read: the values of a form without collections, or a tree.
export const sourceOf = (
  compiled: Compiled,
  values: Readonly<Values>,
  collections: ReadonlyMap<string, Rows>,
): Source => ({
  values,
  tree:
    compiled.collections.size === 0
      ? undefined
      : treeOf(compiled.shape, compiled.collections, values, collections),
});
