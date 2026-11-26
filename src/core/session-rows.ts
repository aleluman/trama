// The commands of a session on rows: add, remove, move and patch, each an
// operation of its engine with one publication, and the handle of each row.
// Every command checks its arguments whole before the engine runs anything.
import type { Row, RowKey } from "./address.js";
import { collectionOf, insertionOf, newRows, positionOf, rowIn, rowOf } from "./commands.js";
import type { FormDefinition } from "./definition.js";
import type { Compiled } from "./compiled.js";
import type { Engine, Publication } from "./engine.js";
import { createHandles, type HandleHost } from "./handles.js";
import { subscriber, type SessionState } from "./notify.js";
import { sessionPatch } from "./patches.js";
import type { Store } from "./tree.js";
import type { CompiledCollection } from "./collections.js";

export const rowCommands = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  engine: Engine<D>,
  guard: (operation: string) => void,
  publish: (publication: Publication<D>) => void,
  parts: RowParts,
) => {
  const store = () => state.published.store;
  const current = { row: (owner: CompiledCollection, key: RowKey) => rowIn(store(), owner, key) };
  const handleOf = handlesOf(state, engine, guard, publish, parts);
  const collection = (name: unknown) => collectionOf(compiled.collections, name);
  return {
    row: (name: unknown, key: unknown) => {
      const found = collection(name);
      return handleOf(rowOf(store(), found, key));
    },
    add: (name: unknown, rows: unknown, options?: unknown) => {
      guard("add rows to");
      const found = collection(name);
      const label = `Collection "${found.name}" add`;
      const created = newRows(found, label, rows);
      const at = insertionOf(label, options, lengthOf(store(), found.name));
      const { publication, keys } = engine.add(found, created, at);
      publish(publication);
      return Object.freeze(keys);
    },
    // Repeated keys remove their row once.
    remove: (name: unknown, keys: unknown) => {
      guard("remove rows from");
      const rows = removed(store(), collection(name), keys);
      publish(engine.remove(collection(name), rows));
    },
    move: (name: unknown, key: unknown, to: unknown) => {
      guard("move rows in");
      const found = collection(name);
      const row = rowOf(store(), found, key);
      publish(engine.move(found, row, destination(store(), found, to)));
    },
    patch: (patch: unknown) => {
      guard("patch");
      publish(engine.patch(sessionPatch(compiled.fields, compiled.collections, patch, current)));
    },
  };
};

// What the handles take from the lists, the queries and the touch of their session.
type RowParts = Pick<
  HandleHost,
  "list" | "queries" | "retry" | "touch" | "touched" | "touchVersion" | "input"
>;
// The handles of a session, which edit their row, create its lists and retry
// its queries as the session does.
const handlesOf = <D extends FormDefinition>(
  state: SessionState<D>,
  engine: Engine<D>,
  guard: (operation: string) => void,
  publish: (publication: Publication<D>) => void,
  parts: RowParts,
) =>
  createHandles({
    published: () => state.published,
    resetVersion: () => state.snapshot.resetVersion,
    attempt: () => state.attempt,
    subscribe: subscriber(state.listeners),
    guard,
    edit: (writes) => publish(engine.patch(writes)),
    ...parts,
  });

// The rows a remove takes, each once.
const removed = (store: Store, collection: CompiledCollection, keys: unknown) => {
  if (!Array.isArray(keys))
    throw new Error(`Collection "${collection.name}" remove: keys must be an array`);
  return [...new Set<Row>((keys as unknown[]).map((key) => rowOf(store, collection, key)))];
};

const lengthOf = (store: Store, name: string) => store.collections.get(name)?.order.length ?? 0;
// Where a row moves to: a position of the rows it is among.
const destination = (store: Store, collection: CompiledCollection, to: unknown) =>
  positionOf(`Collection "${collection.name}" move`, to, lengthOf(store, collection.name) - 1);
