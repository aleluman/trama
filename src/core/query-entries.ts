// The entries of the queries of a session: one per entry of rules of the
// header that declares a query, at its name, and one per query of the each of
// a collection in each of its rows, at the address of its field. Each keeps
// its request in flight, the generation of the entry, and its state. The
// states of the header and those of each row are published apart, and each
// keeps its identity while none of its own changes.
import { rowAddress, type Address, type Field, type Row, type RowKey } from "./address.js";
import { rowLabel, type CompiledCollection } from "./collections.js";
import type { Loader, Scope } from "./endpoints.js";
import { wrapError, type FieldDefinition } from "./fields.js";
import type { Receipt } from "./memory.js";
import { paramsAt, type Params } from "./param-memory.js";
import type { CompiledQuery } from "./params.js";
import type { Context } from "./reads.js";
import type { Store } from "./tree.js";

// The state of a query: pending while a request is in flight, error when the
// last one failed, idle otherwise.
export type QueryState = {
  readonly status: "idle" | "pending" | "error";
  readonly error: Error | undefined;
};
export type QueryStates = Readonly<Record<string, QueryState>>;
// What the queries need from their session: its last publication, with the
// values, the params of each query, undefined while it is suspended, and the
// store.
export type QueryHost = {
  readonly scope: Scope;
  readonly loader: Loader;
  readonly context: Context;
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  readonly collections: ReadonlyMap<string, CompiledCollection>;
  published(): {
    readonly values: Readonly<Record<string, unknown>>;
    readonly queryParams: Params;
    readonly store: Store;
  };
  // Applies a patch as an operation of the engine and publishes it; settle
  // sets the states of the queries once the operation succeeded, before they
  // follow it. It throws, publishing nothing, when the operation fails.
  commit(patch: ReadonlyMap<Field, unknown>, settle: () => void, before?: Store): void;
  // Publishes a change in the states of the queries alone, given those of the
  // header.
  changed(states: QueryStates): void;
};
// A request in flight is the generation of its entry: only its response may
// write, and only if none of its destinations changed after it started.
export type Request = { readonly controller: AbortController; readonly start: number };
// What a response of an entry came to when it arrived: the state it leaves,
// idle or error, and the fields it writes, if any.
export type Outcome = {
  readonly entry: Entry;
  readonly request: Request;
  readonly state: QueryState;
  readonly patch: ReadonlyMap<Field, unknown> | undefined;
};
export type Entry = {
  readonly query: CompiledQuery;
  readonly address: Field;
  readonly row: Row | undefined;
  // The params of the last request, or undefined while suspended.
  requested: object | undefined;
  request: Request | undefined;
  state: QueryState;
};
// The revision rises with each operation that changes values, and each
// address keeps the one of the last operation that changed it. Only a request
// in flight compares them with its start, so they are kept only while there
// is one; a response waiting in the batch keeps its request in flight.
// needed counts the requests in flight of queries forPrepare.
export type Queries = {
  readonly host: QueryHost;
  readonly header: readonly Entry[];
  readonly entries: Map<Field, Entry>;
  readonly rows: Map<RowKey, readonly Entry[]>;
  readonly revisions: Map<Address, number>;
  revision: number;
  inFlight: number;
  needed: number;
  states: QueryStates;
  // The states of each row whose queries are not all idle or all pending,
  // and the rows whose states may have changed since they were published.
  readonly rowStates: Map<RowKey, QueryStates>;
  readonly dirty: Set<Row>;
  // The outcomes of the responses that arrived since the last close.
  readonly batch: Outcome[];
};

export const idle: QueryState = Object.freeze({ status: "idle", error: undefined });
export const pending: QueryState = Object.freeze({ status: "pending", error: undefined });
export const failure = (error: Error): QueryState => Object.freeze({ status: "error", error });
// The states of a form, or of a collection, without queries: always the same
// empty object.
export const noQueries = Object.freeze({});
// The state of each entry given, by the name of its field.
export const statesOf = (entries: readonly Entry[]): QueryStates =>
  Object.freeze(Object.fromEntries(entries.map((entry) => [entry.query.name, entry.state])));
// The states of a row of a collection whose queries are all idle, or all
// pending: the same object for every row of every session of its definition.
const uniform = new WeakMap<CompiledCollection, Map<QueryState, QueryStates>>();
const uniformOf = (collection: CompiledCollection, state: QueryState) => {
  let found = uniform.get(collection);
  if (found === undefined) uniform.set(collection, (found = new Map<QueryState, QueryStates>()));
  let states = found.get(state);
  if (states === undefined) {
    states = Object.freeze(
      Object.fromEntries(Array.from(collection.queries.keys(), (name) => [name, state])),
    );
    found.set(state, states);
  }
  return states;
};

// The label of the diagnostics of an entry: that of its query, which names
// the row of a row.
export const labelOf = ({ query, row }: Entry) =>
  row === undefined ? query.label : rowLabel(row, query.name, query.label);
// The state of an entry whose request or response failed, with its label.
export const failed = (entry: Entry, what: string, cause: unknown) =>
  failure(wrapError(`${labelOf(entry)}: ${what}`, cause));
// Whether an operation changed the address after the request started at since.
export const revisedAfter = (queries: Queries, address: Field, since: number) =>
  (queries.revisions.get(address) ?? 0) > since;

// Every request goes in and out of an entry here, so the queries know whether
// one is in flight.
export const track = (queries: Queries, entry: Entry, request?: Request) => {
  const needed = Number(entry.query.forPrepare);
  if (entry.request !== undefined) {
    queries.inFlight -= 1;
    queries.needed -= needed;
  }
  if (request !== undefined) {
    queries.inFlight += 1;
    queries.needed += needed;
  }
  entry.request = request;
  if (queries.inFlight === 0) queries.revisions.clear();
};
// An entry without request, in a state.
export const release = (queries: Queries, entry: Entry, state: QueryState) => {
  track(queries, entry);
  if (entry.state === state) return;
  entry.state = state;
  if (entry.row !== undefined) queries.dirty.add(entry.row);
};
// Stopping a request aborts its signal: aborting only saves work, the check of
// the generation is the guarantee. The request leaves first, since the abort
// runs code of the application.
export const stop = (queries: Queries, entry: Entry, state: QueryState) => {
  const { request } = entry;
  release(queries, entry, state);
  request?.controller.abort();
};

// The entries of a row that enters the store, at opening, in an add or at
// reset, with the params in force. Pushes to starting those whose params are
// defined and whose field was not supplied in the row, in the order of the
// each.
export const enter = (
  queries: Queries,
  row: Row,
  {
    queryParams,
    supplied,
  }: { readonly queryParams: Params; readonly supplied: Receipt["supplied"] },
  starting: Entry[],
) => {
  const entries: Entry[] = [];
  for (const query of row.collection.queries.values()) {
    const address = rowAddress(row, query.name);
    const requested = paramsAt(queryParams, address);
    const entry: Entry = { query, address, row, requested, request: undefined, state: idle };
    queries.entries.set(address, entry);
    entries.push(entry);
    if (requested !== undefined && supplied?.(address) !== true) starting.push(entry);
  }
  queries.rows.set(row.key, entries);
};
// The entries of a row that a committed remove takes, or reset forgets: each
// stops, and a response of its request finds another generation. The
// revisions of its fields leave with it.
export const leave = (queries: Queries, key: RowKey) => {
  const entries = queries.rows.get(key);
  if (entries === undefined) return;
  queries.rows.delete(key);
  queries.rowStates.delete(key);
  for (const entry of entries) {
    queries.entries.delete(entry.address);
    stop(queries, entry, idle);
  }
  const row = entries[0]?.row;
  if (queries.revisions.size > 0 && row !== undefined)
    for (const address of row.addresses.values()) queries.revisions.delete(address);
};

// The published states keep their identity while none changes: those of the
// header, kept in states, and those of each row. Gives whether some changed.
export const queryStates = (queries: Queries) => {
  const { header, states } = queries;
  let changed = header.some((entry) => states[entry.query.name] !== entry.state);
  if (changed) queries.states = statesOf(header);
  for (const row of queries.dirty) changed = publishRow(queries, row) || changed;
  queries.dirty.clear();
  return changed;
};
const publishRow = (queries: Queries, row: Row) => {
  const entries = queries.rows.get(row.key);
  if (entries === undefined) return false;
  const before = rowQueries(queries, row.collection, row.key);
  if (entries.every((entry) => before[entry.query.name] === entry.state)) return false;
  const [{ state }] = entries as [Entry];
  if (state === idle && entries.every((entry) => entry.state === idle))
    queries.rowStates.delete(row.key);
  else
    queries.rowStates.set(
      row.key,
      state === pending && entries.every((entry) => entry.state === pending)
        ? uniformOf(row.collection, pending)
        : statesOf(entries),
    );
  return true;
};
// The states of the queries of a row, as its handle publishes them.
export const rowQueries = (queries: Queries, collection: CompiledCollection, key: RowKey) =>
  collection.queries.size === 0
    ? (noQueries as QueryStates)
    : (queries.rowStates.get(key) ?? uniformOf(collection, idle));
