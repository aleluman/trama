// The request of an entry and the arrival of its response. A response of
// another generation is ignored; one whose destinations changed after its
// start is discarded whole; otherwise its patch runs and is checked, and its
// outcome joins the batch of the session. The patch of a query of a row
// writes fields of its own row, by name.
import { rowAddress, type Field, type Row } from "./address.js";
import { copyData, describe, ownEntries } from "./data.js";
import { requestOf, send } from "./endpoints.js";
import { fieldAt, isPlainRecord, wrapError } from "./fields.js";
import { checkPatch, rowPatch } from "./patches.js";
import { enqueue } from "./query-batch.js";
import {
  failed,
  failure,
  idle,
  labelOf,
  pending,
  revisedAfter,
  stop,
  track,
  type Entry,
  type Queries,
  type QueryHost,
  type QueryState,
  type Request,
} from "./query-entries.js";
import { toolsWith } from "./reads.js";
import { recordIn } from "./tree.js";

export const start = (queries: Queries, entry: Entry) => {
  stop(queries, entry, pending);
  const request: Request = { controller: new AbortController(), start: queries.revision };
  track(queries, entry, request);
  const { scope, loader } = queries.host;
  const asked = requestOf(entry.query.endpoint, scope, entry.requested as object, "", 1);
  send(loader, asked, request.controller.signal).then(
    (result) => {
      respond(queries, entry, request, result);
    },
    (error: unknown) => {
      if (entry.request !== request) return;
      enqueue(queries, {
        entry,
        request,
        state: failed(entry, "request failed", error),
        patch: undefined,
      });
    },
  );
};

const respond = (queries: Queries, entry: Entry, request: Request, result: unknown) => {
  if (entry.request !== request) return;
  let state: QueryState = idle;
  let patch: ReadonlyMap<Field, unknown> | undefined;
  try {
    const found = patchOf(queries.host, entry, result);
    // patch is code of the application: it may have run another operation.
    if (entry.request !== request) return;
    if (found !== undefined && !changedSince(queries, entry, request.start, found))
      patch = owned(checked(queries.host, entry, found));
  } catch (error) {
    if (entry.request !== request) return;
    state = failure(error as Error);
  }
  enqueue(queries, { entry, request, state, patch });
};

type Found = (readonly [PropertyKey, unknown])[];
// The fields a response writes: those of patch, or the result in the field of
// the entry. An undefined result writes nothing.
const patchOf = (host: QueryHost, entry: Entry, result: unknown): Found | undefined => {
  const { query } = entry;
  if (query.patch === undefined) return result === undefined ? undefined : [[query.name, result]];
  let returned: unknown;
  let found: Found = [];
  try {
    returned = query.patch(result, toolsOf(host, entry.row));
    if (isPlainRecord(returned)) found = ownEntries(returned);
  } catch (cause) {
    throw wrapError(`${labelOf(entry)}: patch failed`, cause);
  }
  if (returned === undefined) return;
  if (!isPlainRecord(returned))
    throw new Error(`${labelOf(entry)}: expected a patch object, got ${describe(returned)}`);
  return found;
};
// What patch receives: the values of the last publication and, in a row, the
// record of its row there and its key.
const toolsOf = (host: QueryHost, row: Row | undefined) => {
  const { values, store } = host.published();
  if (row === undefined) return toolsWith({ values }, host.context);
  const records = store.collections.get(row.collection.name)?.records;
  const record = records && recordIn(records, row.key);
  return toolsWith({ row: record, values, key: row.key }, host.context);
};
// The fields of the header a patch of the header writes, which are no
// collection, or those of its own row a patch of a row writes.
const checked = (host: QueryHost, entry: Entry, found: Found) =>
  entry.row === undefined
    ? checkPatch(labelOf(entry), host.fields, found, host.collections)
    : rowPatch(labelOf(entry), entry.row, found);

// The patch keeps its own copy of each option it writes: code of the
// application that runs before the close cannot change what it writes.
const owned = (patch: ReadonlyMap<Field, unknown>) => {
  for (const [address, value] of patch)
    if (typeof value === "object" && value !== null)
      (patch as Map<Field, unknown>).set(address, copyData(value, "option"));
  return patch;
};

// Whether a destination of the patch, a field it writes, changed after since.
const changedSince = (queries: Queries, entry: Entry, since: number, found: Found) => {
  for (const [name, value] of found) {
    const address = entry.row === undefined ? name : destination(entry.row, name);
    if (value !== undefined && revisedAfter(queries, address as Field, since)) return true;
  }
  return false;
};
const destination = (row: Row, name: PropertyKey) =>
  typeof name === "string" && fieldAt(row.collection.fields, name) !== undefined
    ? rowAddress(row, name)
    : undefined;
