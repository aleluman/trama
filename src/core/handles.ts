// The handle of a row: the same object while its row exists, bound to its key
// and checked on every call. It has the members a binding uses of a session,
// and no reference to the session, so a draft could take its place.
import {
  fieldLabel,
  rowAddress,
  type Field,
  type Row,
  type RowAddress,
  type RowKey,
} from "./address.js";
import { rowIn } from "./commands.js";
import type { CompiledCollection } from "./collections.js";
import { describe, type OptionShape } from "./data.js";
import { fieldAt, validateValue } from "./fields.js";
import type { OptionList } from "./lists.js";
import { recordIn, type Store } from "./tree.js";
import type { States } from "./states.js";
import type { ScopeState } from "./scope-states.js";
import type { QueryStates } from "./query-entries.js";

export type RowSnapshotOf = ScopeState & {
  readonly values: Readonly<Record<string, unknown>>;
  readonly fieldStates: States;
  readonly resetVersion: number;
  readonly queries: QueryStates;
  readonly attempted: boolean;
  readonly touched: boolean;
};
// The controller of the pending input of one view of a field.
export type InputView = {
  error(message?: string): void;
  dispose(): void;
};
export type HandleOf = {
  readonly collection: string;
  readonly key: RowKey;
  readonly fields: CompiledCollection["fields"];
  getSnapshot(): RowSnapshotOf | undefined;
  subscribe(listener: () => void): () => void;
  edit(name: string, value: unknown): void;
  list(name: string): OptionList<OptionShape>;
  retry(name: string): void;
  touch(name?: string): void;
  input(name: string): InputView;
};
// What the handles need from their session: what it published last, its reset
// version, the states of the queries of each row, and how it listens, edits,
// creates the list of a field and retries a query.
export type HandleHost = {
  published(): {
    readonly store: Store;
    readonly rowStates: { readonly get: (key: RowKey) => States | undefined };
    readonly rowScopes: { readonly get: (key: RowKey) => ScopeState | undefined };
  };
  resetVersion(): number;
  // The frontier of the last attempt, if any: a row up to it is attempted.
  attempt(): number | undefined;
  subscribe(listener: () => void): () => void;
  guard(operation: string): void;
  edit(writes: ReadonlyMap<Field, unknown>): void;
  // The list of a field of a row, which throws if the field is not async.
  list(address: RowAddress): OptionList<OptionShape>;
  queries(collection: CompiledCollection, key: RowKey): QueryStates;
  // Retries the query of a field of a row that has one.
  retry(address: RowAddress): void;
  // Touches a row, or a cell of it, and says whether a row is touched, with a
  // version that changes when a row is touched or a reset clears them.
  touch(row: Row, address: RowAddress | undefined): void;
  touched(row: Row): boolean;
  touchVersion(): number;
  // A controller for a view of a cell.
  input(address: RowAddress): InputView;
};

// The handles of a session: one per row, the same while the row lives. A reset
// or a commit brings back the very rows of its baseline, so their handles too;
// those of rows that leave go with them.
export const createHandles = (host: HandleHost) => {
  const handles = new WeakMap<Row, HandleOf>();
  return (row: Row): HandleOf => {
    let found = handles.get(row);
    if (found === undefined) handles.set(row, (found = createHandle(host, row)));
    return found;
  };
};

const createHandle = (host: HandleHost, own: Row): HandleOf => {
  const { collection, key } = own;
  const rowOf = () => currentRow(host, collection, key);
  return Object.freeze({
    collection: collection.name,
    key,
    fields: collection.fields,
    getSnapshot: snapshots(host, own),
    subscribe: (listener: () => void) => host.subscribe(listener),
    edit: (name: string, value: unknown) => {
      host.guard("edit");
      const row = rowOf();
      validateValue(name, itemOf(collection, name), value, fieldLabel(name, row));
      host.edit(new Map([[rowAddress(row, name), value]]));
    },
    // A new option list for one view of an async field of the row, which may
    // be created while the session notifies, as those of the session.
    list: (name: string) => {
      const row = rowOf();
      itemOf(collection, name);
      return host.list(rowAddress(row, name));
    },
    // A command, as edit.
    retry: (name: string) => {
      host.guard("retry");
      const row = rowOf();
      if (typeof name !== "string" || !collection.queries.has(name))
        throw new Error(`Field ${describe(name)} of "${collection.name}" has no query`);
      host.retry(rowAddress(row, name));
    },
    // A command, as edit: the row, or one of its cells.
    touch: (name?: string) => {
      host.guard("touch");
      const row = rowOf();
      host.touch(row, name === undefined ? undefined : cellOf(collection, row, "touch", name));
    },
    // A controller may be created while the session notifies, as a list.
    input: (name: string) => host.input(cellOf(collection, rowOf(), "input", name)),
  });
};
// A cell of a row, for touch and input, whose diagnostics name the command.
const cellOf = (collection: CompiledCollection, row: Row, command: string, name: string) => {
  if (fieldAt(collection.fields, name) === undefined)
    throw new Error(
      `Collection "${collection.name}": ${command}: field ${describe(name)} does not exist`,
    );
  return rowAddress(row, name);
};

// What edit and list check first: that the row exists, and then that it has
// the field.
const currentRow = (host: HandleHost, collection: CompiledCollection, key: RowKey) => {
  const row = rowIn(host.published().store, collection, key);
  if (row === undefined)
    throw new Error(`Collection "${collection.name}": row "${key}" was removed`);
  return row;
};
const itemOf = (collection: CompiledCollection, name: string) => {
  const item = fieldAt(collection.fields, name);
  if (item === undefined)
    throw new Error(`Collection "${collection.name}": unknown field "${String(name)}"`);
  return item;
};

// The same snapshot while the values, the states, the states of the queries,
// the scope and the reset version of its row do not change; undefined while
// its row does not exist. A scope keeps its object while its content does.
// A row is attempted when its sequence is within the frontier of the last attempt.
const snapshots = (host: HandleHost, row: Row) => {
  const { collection, key, seq } = row;
  let cached: RowSnapshotOf | undefined;
  let held: ScopeState | undefined;
  // Whether the row is touched, read again only when the version changes.
  let version = -1;
  let touched = false;
  return () => {
    const { store, rowStates, rowScopes } = host.published();
    const resetVersion = host.resetVersion();
    const rows = store.collections.get(collection.name);
    const values = rows && recordIn(rows.records, key);
    const fieldStates = rowStates.get(key);
    const scope = rowScopes.get(key);
    if (values === undefined || fieldStates === undefined || scope === undefined) return;
    const queries = host.queries(collection, key);
    const frontier = host.attempt();
    const attempted = frontier !== undefined && seq <= frontier;
    if (host.touchVersion() !== version) {
      version = host.touchVersion();
      touched = host.touched(row);
    }
    if (
      cached?.values !== values ||
      cached.fieldStates !== fieldStates ||
      cached.queries !== queries ||
      cached.resetVersion !== resetVersion ||
      cached.attempted !== attempted ||
      cached.touched !== touched ||
      held !== scope
    ) {
      held = scope;
      cached = Object.freeze({
        values,
        fieldStates,
        resetVersion,
        queries,
        ...scope,
        attempted,
        touched,
      });
    }
    return cached;
  };
};
