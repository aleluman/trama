// After the values of an operation commit, the formulas of state and params
// observe them, the states combine and the published states derive from them.
// An operation collects what it changes of the memory in a delta, which
// applies only once every observer succeeded, the states combined and the
// published ones derived: a step that fails leaves the memory as it was, so
// no later operation finds its contributions.
import type { Address, Row } from "./address.js";
import type { Compiled } from "./compiled.js";
import {
  applyDelta,
  contributionsAfter,
  deltaOf,
  none,
  type Change,
  type Memory,
  type Observed,
  type State,
} from "./memory.js";
import { observe, type Runs } from "./observe.js";
import { publish, type Marking } from "./published.js";
import type { Given } from "./reads.js";
import type { Resolution } from "./resolution.js";
import { readersOf } from "./invalidation.js";
import type { Observer } from "./rules.js";
import { holds, readerOf, sourceOf, valueAt, type Store } from "./tree.js";

export const observed = (
  compiled: Compiled,
  given: Given,
  change: Change | undefined,
  store: Store,
  memory: Memory,
  resolution: Resolution,
  published: State | undefined,
  marking?: Marking,
): Observed => {
  const delta = deltaOf(memory, change, resolution.reads);
  const read = readerOf(store);
  const source = sourceOf(compiled, store.values, store.collections);
  const changed = change && changedAddresses(change, resolution, store);
  const runs = changed && runsOf(memory, change as Change, changed, store);
  const into = { memory, delta };
  const { replaced, messages } = observe(
    compiled,
    given.context,
    source,
    read,
    runs,
    into,
    store.collections,
  );
  const states = publish(
    compiled,
    given.deriver,
    { store, baseline: change?.baseline ?? store, previous: published, changed, marking },
    contributionsAfter(memory, delta),
    change && { replaced, messages, added: change.added ?? none, removed: change.removed ?? none },
  );
  const next = applyDelta(memory, delta);
  return {
    writers: resolution.writers,
    state: { ...next, store, ...states },
    receipt: change && {
      changed: changed as ReadonlySet<Address>,
      added: change.added ?? none,
      removed: change.removed?.map((row) => row.key) ?? none,
      supplied: change.supplied,
      queried: delta.params.queryParams,
    },
  };
};

// The observers a change runs: those that read an address whose value
// changed, and those of the rows it adds, which never ran. Any other read the
// same values as before. Their rows go in creation order.
const runsOf = (
  memory: Memory,
  change: Change,
  changed: ReadonlySet<Address>,
  store: Store,
): Runs => {
  const observers = new Set<Observer>();
  const rows = new Set<Row>(change.added);
  const held = (row: Row) => holds(store.collections, row);
  for (const address of changed)
    readersOf<Observer>(memory.readers.observers, address, held, (observer) => {
      observers.add(observer);
      if ("row" in observer && observer.row !== undefined) rows.add(observer.row);
    });
  return { observers, added: new Set(change.added), rows: inCreation(rows, store) };
};

// Rows by creation order: as they came if they came so, or else as their
// collections hold them.
const inCreation = (rows: ReadonlySet<Row>, store: Store): readonly Row[] => {
  let last = -Infinity;
  for (const { seq } of rows) {
    if (seq < last) return heldIn(rows, store);
    last = seq;
  }
  return [...rows];
};
const heldIn = (rows: ReadonlySet<Row>, store: Store) => {
  const ordered: Row[] = [];
  for (const { created } of store.collections.values())
    for (const row of created) if (rows.has(row)) ordered.push(row);
  return ordered;
};

// The addresses whose committed value differs from the one before: among
// those the change wrote and those its resolution wrote, and the structure of
// each collection whose keys changed.
const changedAddresses = (change: Change, resolution: Resolution, store: Store) => {
  const { previous } = change;
  const changed = new Set<Address>();
  const check = (address: Address) => {
    if (changed.has(address)) return;
    const before = valueAt(previous.values, previous.collections, address);
    if (!Object.is(valueAt(store.values, store.collections, address), before)) changed.add(address);
  };
  for (const address of change.roots) check(address);
  for (const address of resolution.written.keys()) check(address);
  return changed;
};
