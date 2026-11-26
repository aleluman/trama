// The states of the rows: what each collection declares, the contributions of
// the formulas of state of each row in declaration order, and then the lock.
// The lock is shared: a collection combines what it declares with the lock
// once, and a row that none of its own formulas reaches takes those states.
import type { Row } from "./address.js";
import type { CompiledCollection } from "./collections.js";
import type { Compiled } from "./compiled.js";
import { editRowMap, noRowMap, type RowMap } from "./row-maps.js";
import type { StateFormula } from "./rules.js";
import { combineStates, type Contributions, type States } from "./states.js";
import type { Store } from "./tree.js";

// What the previous publication had: the states of each row and, per
// collection, the states of a row without formulas of its own.
type Before = {
  readonly rowStates: RowMap<States>;
  readonly locked: ReadonlyMap<string, States>;
};

// The lock reaches the fields of rows by collection.
const reachOf =
  (collection: CompiledCollection) => (formula: StateFormula & { readonly kind: "property" }) =>
    formula.row === undefined ? (formula.rows?.get(collection.name) ?? []) : formula.names;

export const lockedStates = (
  compiled: Compiled,
  contributions: Contributions,
  previous: ReadonlyMap<string, States> | undefined,
) =>
  new Map(
    Array.from(compiled.collections.values(), (collection) => [
      collection.name,
      combineStates(
        collection,
        compiled.locks,
        contributions,
        previous?.get(collection.name),
        reachOf(collection),
      ),
    ]),
  );

// Combines rows, with what each collection shares built once.
const rowCombiner = (
  compiled: Compiled,
  contributions: Contributions,
  locked: ReadonlyMap<string, States>,
  previous: Before | undefined,
) => {
  const shares = new Map<CompiledCollection, ReturnType<typeof shareOf>>();
  const shareOf = (collection: CompiledCollection) => {
    const states = locked.get(collection.name) as States;
    return {
      reach: reachOf(collection),
      shared: { states, formulas: compiled.locks },
      // The states shared before, which a row keeps while they are the same.
      before: previous?.locked.get(collection.name),
    };
  };
  return (row: Row): States => {
    const { collection } = row;
    let share = shares.get(collection);
    if (share === undefined) {
      share = shareOf(collection);
      shares.set(collection, share);
    }
    const before = previous?.rowStates.get(row.key);
    const own: StateFormula[] = [];
    for (const template of collection.states) {
      const instance = row.instances.get(template) as StateFormula | undefined;
      if (instance !== undefined && contributions.get(instance) !== undefined) own.push(instance);
    }
    // A new row, or one that shared the states of its collection, shares them
    // still; any other keeps the object of each field whose state is the same.
    if (own.length === 0 && (before === undefined || before === share.before))
      return share.shared.states;
    return combineStates(collection, own, contributions, before, share.reach, share.shared, row);
  };
};

// The states of every row.
export const allRows = (
  compiled: Compiled,
  store: Store,
  contributions: Contributions,
  locked: ReadonlyMap<string, States>,
  previous: Before | undefined,
) => {
  const combine = rowCombiner(compiled, contributions, locked, previous);
  const states = editRowMap(noRowMap<States>());
  for (const { created } of store.collections.values())
    for (const row of created) states.set(row.key, combine(row));
  return states.done();
};

const noRows: ReadonlySet<Row> = new Set();
// Only the rows whose contributions changed or that the operation added
// combine again, and the states of removed rows leave, in a version of the map
// that copies only the chunks it writes. Returns the rows whose states changed.
export const someRows = (
  compiled: Compiled,
  contributions: Contributions,
  previous: Before,
  replaced: readonly StateFormula[],
  added: readonly Row[],
  removed: readonly Row[],
) => {
  const rows = new Set(added);
  for (const formula of replaced) if (formula.row !== undefined) rows.add(formula.row);
  if (rows.size === 0 && removed.length === 0)
    return { states: previous.rowStates, changed: noRows };
  const combine = rowCombiner(compiled, contributions, previous.locked, previous);
  const changed = new Set<Row>();
  const states = editRowMap(previous.rowStates);
  for (const row of rows) {
    const next = combine(row);
    if (next === previous.rowStates.get(row.key)) continue;
    states.set(row.key, next);
    changed.add(row);
  }
  for (const row of removed) states.delete(row.key);
  return { states: states.done(), changed };
};
