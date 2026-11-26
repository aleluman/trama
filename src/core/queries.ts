// The queries of a session: they open with it and at each reset, follow each
// operation in proportion to what it did, and retry on demand. Each operation
// returns the states of the header to publish; those of the rows are read by
// their handles.
import type { Address, Field, Row } from "./address.js";
import type { Compiled } from "./compiled.js";
import { describe } from "./data.js";
import type { Receipt } from "./memory.js";
import { paramsAt } from "./param-memory.js";
import {
  enter,
  idle,
  leave,
  noQueries,
  queryStates,
  statesOf,
  stop,
  type Entry,
  type Queries,
  type QueryHost,
} from "./query-entries.js";
import { start } from "./query-response.js";
export { noQueries, rowQueries, type QueryState } from "./query-entries.js";
export type { Entry, Queries } from "./query-entries.js";

export const createQueries = (compiled: Pick<Compiled, "queries">, host: QueryHost): Queries => {
  const header: Entry[] = Array.from(compiled.queries.values(), (query) => ({
    query,
    address: query.name,
    row: undefined,
    requested: undefined,
    request: undefined,
    state: idle,
  }));
  return {
    host,
    header,
    entries: new Map(header.map((entry) => [entry.address, entry])),
    rows: new Map(),
    revisions: new Map(),
    revision: 0,
    inFlight: 0,
    needed: 0,
    states: header.length === 0 ? noQueries : statesOf(header),
    rowStates: new Map(),
    dirty: new Set(),
    batch: [],
  };
};

// At opening and at reset every query stops and takes its params as the last
// requested; the entries of the rows are those of the rows in the store. Each
// starts if its params are defined and its field was not supplied, as the
// receipt says: in initial at opening and at reset before a commit, and in the
// baseline after one.
// The header starts first, then each collection, its rows in creation order
// and their queries in the order of its each.
export const openQueries = (queries: Queries, receipt: Receipt) => {
  const { queryParams, store } = queries.host.published();
  queries.revision += 1;
  for (const key of queries.rows.keys()) leave(queries, key);
  for (const entry of queries.header) {
    stop(queries, entry, idle);
    entry.requested = paramsAt(queryParams, entry.address);
    if (entry.requested !== undefined && receipt.supplied?.(entry.address) !== true)
      start(queries, entry);
  }
  const starting: Entry[] = [];
  const given = { queryParams, supplied: receipt.supplied };
  for (const collection of queries.host.collections.values())
    if (collection.queries.size > 0)
      for (const row of store.collections.get(collection.name)?.created ?? [])
        enter(queries, row, given, starting);
  for (const entry of starting) start(queries, entry);
  queryStates(queries);
  return queries.states;
};

// After a change, as its receipt says, unless there is no entry to follow nor
// row to enter: the entries of the rows it removed leave, and the addresses it
// changed take its revision. Each entry of the header, in its turn, stops if
// the operation changed its field, which the commit of a response already
// did, starts another request if its params changed and stops if they are
// undefined. Then the rows, as the receipt says: the entries whose field
// changed stop, those whose params changed follow them as in the header, and
// the rows it added enter; their requests start in the order of the opening.
export const followQueries = (queries: Queries, receipt: Receipt) => {
  if (queries.entries.size === 0 && receipt.added.length === 0) return queries.states;
  const { queryParams } = queries.host.published();
  for (const key of receipt.removed) leave(queries, key);
  const changed = receipt.changed as ReadonlySet<Address>;
  revise(queries, changed);
  for (const entry of queries.header) {
    if (changed.has(entry.address)) stop(queries, entry, idle);
    if (renewed(queries, entry, paramsAt(queryParams, entry.address))) start(queries, entry);
  }
  const starting: Entry[] = [];
  if (queries.rows.size > 0) {
    for (const address of changed) {
      const entry = typeof address === "string" ? undefined : queries.entries.get(address as Field);
      if (entry !== undefined) stop(queries, entry, idle);
    }
    for (const address of receipt.queried?.keys() ?? []) {
      const entry = typeof address === "string" ? undefined : queries.entries.get(address);
      if (entry !== undefined && renewed(queries, entry, paramsAt(queryParams, address)))
        starting.push(entry);
    }
  }
  const given = { queryParams, supplied: receipt.supplied };
  for (const row of receipt.added)
    if (row.collection.queries.size > 0) enter(queries, row, given, starting);
  if (starting.length > 1) starting.sort(inOrder);
  for (const entry of starting) start(queries, entry);
  queryStates(queries);
  return queries.states;
};
// While a request is in flight, each address an operation changed takes its
// revision if a response may write it: a field of the header, or of a row
// with queries. No response writes a structure or a row without them, and
// their revisions would keep removed rows.
const revise = (queries: Queries, changed: ReadonlySet<Address>) => {
  if (changed.size === 0) return;
  const revision = ++queries.revision;
  if (queries.inFlight === 0) return;
  for (const address of changed)
    if (
      typeof address === "string" ||
      (address.kind === "row" && queries.rows.has(address.row.key))
    )
      queries.revisions.set(address, revision);
};
// Whether the params of an entry changed to defined ones, which start another
// request; undefined ones stop its query.
const renewed = (queries: Queries, entry: Entry, params: object | undefined) => {
  if (params === entry.requested) return false;
  entry.requested = params;
  if (params === undefined) stop(queries, entry, idle);
  return params !== undefined;
};
// The order of the starts of the rows: each collection, its rows in creation
// order and the queries of a row in the order of its each.
const inOrder = (a: Entry, b: Entry) =>
  (a.row as Row).collection.index - (b.row as Row).collection.index ||
  (a.row as Row).seq - (b.row as Row).seq ||
  a.query.index - b.query.index;

// The entry of a field of the header with a query.
export const headerEntry = (queries: Queries, name: unknown) => {
  const entry = typeof name === "string" ? queries.entries.get(name) : undefined;
  if (entry === undefined) throw new Error(`Field ${describe(name)} has no query`);
  return entry;
};
// A new request of an entry with the same params, even with another one
// pending; a suspended query does nothing. Gives whether the states changed.
export const retryQuery = (queries: Queries, entry: Entry) => {
  if (entry.requested !== undefined) start(queries, entry);
  return queryStates(queries);
};
