// The candidate of each operation of the engine: a copy of the store with the
// fields it writes or the rows it adds, removes or moves.
import {
  createRow,
  definitionAt,
  rowAddress,
  type Address,
  type Field,
  type Row,
  type RowKey,
} from "./address.js";
import { adopt, fieldAt, validateValue, type FieldDefinition } from "./fields.js";
import { createBaseline } from "./baseline.js";
import { unknownCollection, type CompiledCollection } from "./collections.js";
import type { NewRow } from "./commands.js";
import type { Compiled } from "./compiled.js";
import type { Given } from "./reads.js";
import { candidateOf, valueAt, writeAt, type Candidate, type Draft, type Store } from "./tree.js";

type Values = Record<string, unknown>;

// The fields each new row was given, which prevail over its formulas.
type Supplied = Map<Row, ReadonlySet<string>>;
const suppliedIn = (supplied: Supplied) => (address: Field) =>
  typeof address !== "string" && supplied.get(address.row)?.has(address.field) === true;

// New rows take their keys and go at their position, after every row in
// creation order.
const withRows = (
  draft: Draft,
  collection: CompiledCollection,
  rows: readonly NewRow[],
  at: number,
  supplied: Supplied,
) => {
  const created = rows.map((row) => {
    const found = createRow(collection);
    supplied.set(found, row.supplied);
    return found;
  });
  const map = new Map(draft.rows);
  for (const row of created) map.set(row.key, row);
  // A batch of any size: its keys are no arguments of a call.
  const before = [...draft.order];
  const order = before.slice(0, at);
  for (const row of created) order.push(row.key);
  for (let index = at; index < before.length; index++) order.push(before[index] as RowKey);
  return {
    created,
    draft: {
      ...draft,
      order: Object.freeze(order),
      created: [...draft.created, ...created],
      rows: map,
      written: new Map(
        created.map((row, index) => [row.key, { ...rows[index]?.values } as Values]),
      ),
    },
  };
};

// The opening values: the baseline, whose rows get their keys in its order,
// and the formulas of every field, whose supplied values prevail.
export const opening = (compiled: Compiled, given: Given, initial: unknown) => {
  const baseline = createBaseline(compiled, given.defaults, initial);
  const candidate: Candidate = { values: { ...baseline.values }, collections: new Map() };
  const supplied: Supplied = new Map();
  for (const [name, rows] of baseline.rows) {
    const collection = compiled.collections.get(name) as CompiledCollection;
    candidate.collections.set(name, withRows(empty(), collection, rows, 0, supplied).draft);
  }
  // The engine keeps what each field and row was given, never the values.
  const rowSupplied = suppliedIn(supplied);
  const header = baseline.supplied;
  return {
    candidate,
    supplied: (address: Field) =>
      typeof address === "string" ? header.has(address) : rowSupplied(address),
  };
};
const empty = (): Draft => ({
  order: [],
  created: [],
  rows: new Map(),
  records: { published: [], at: new Map() },
  written: new Map(),
});

// Where a command keeps its direct edits: only a form with onEdit does.
export const editsOf = (compiled: Compiled) =>
  compiled.hasEdits ? new Map<Field, unknown>() : undefined;

// An option with the value held is the held one, so it is no difference. An
// edit without difference runs no formula and no event.
export const edited = (compiled: Compiled, store: Store, name: PropertyKey, value: unknown) => {
  const field = String(name);
  const item = fieldAt(compiled.fields, name);
  if (item === undefined && typeof name === "string" && compiled.collections.has(name))
    throw new Error(`Collection "${name}" cannot be edited as a field; use row or patch`);
  validateValue(field, item, value);
  const previous = store.values;
  const written = adopt(item as FieldDefinition, value, [previous[field]]);
  if (Object.is(previous[field], written)) return;
  const candidate = candidateOf(store);
  candidate.values[field] = written;
  return candidate;
};

// A patch writes its fields, of the header or of rows, whose options are
// adopted as in an edit, each against the value at its own address, and runs
// as an edit of those fields. One that changes nothing runs nothing. Given
// edits, it keeps there each field it changed with the value it stores: the
// adopted value is the one held when it is equal by its type, so a change is
// a difference by that equality.
export const patched = (
  compiled: Compiled,
  store: Store,
  writes: ReadonlyMap<Field, unknown>,
  edits?: Map<Field, unknown>,
) => {
  const candidate = candidateOf(store);
  let differs = false;
  for (const [address, value] of writes) {
    const previous = valueAt(store.values, store.collections, address);
    const written = adopt(definitionAt(compiled.fields, address), value, [previous]);
    writeAt(candidate, address, written);
    if (Object.is(previous, written)) continue;
    differs = true;
    edits?.set(address, written);
  }
  return differs ? candidate : undefined;
};

// Adding no row changes nothing. The roots of an add are the structure of its
// collection and every field of the rows it creates.
export const added = (
  store: Store,
  collection: CompiledCollection,
  rows: readonly NewRow[],
  at: number,
) => {
  if (rows.length === 0)
    return { candidate: undefined, created: [], supplied: undefined, roots: [] };
  const candidate = candidateOf(store);
  const supplied: Supplied = new Map();
  const { draft, created } = withRows(
    draftOf(candidate, collection),
    collection,
    rows,
    at,
    supplied,
  );
  candidate.collections.set(collection.name, draft);
  const roots: Address[] = [collection.structure];
  for (const row of created)
    for (const name of Object.keys(collection.fields)) roots.push(rowAddress(row, name));
  return { candidate, created, supplied: suppliedIn(supplied), roots };
};

// Removing no row changes nothing.
export const removed = (store: Store, collection: CompiledCollection, rows: readonly Row[]) => {
  if (rows.length === 0) return;
  const candidate = candidateOf(store);
  const draft = draftOf(candidate, collection);
  const gone = new Set(rows);
  const map = new Map(draft.rows);
  for (const row of rows) map.delete(row.key);
  const order: RowKey[] = [];
  for (const key of draft.order) if (map.has(key)) order.push(key);
  candidate.collections.set(collection.name, {
    ...draft,
    order: Object.freeze(order),
    created: draft.created.filter((row) => !gone.has(row)),
    rows: map,
  });
  return candidate;
};

// A row moved to its own position moves nothing.
export const moved = (store: Store, collection: CompiledCollection, row: Row, to: number) => {
  const candidate = candidateOf(store);
  const draft = draftOf(candidate, collection);
  if (draft.order[to] === row.key) return;
  const order = [...draft.order];
  order.splice(order.indexOf(row.key), 1);
  order.splice(to, 0, row.key);
  candidate.collections.set(collection.name, { ...draft, order: Object.freeze(order) });
  return candidate;
};

const draftOf = (candidate: Candidate, collection: CompiledCollection) => {
  const draft = candidate.collections.get(collection.name);
  if (draft === undefined) throw unknownCollection(collection.name);
  return draft;
};
