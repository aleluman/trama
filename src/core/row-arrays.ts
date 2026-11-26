// The states a session publishes in fieldStates: those of the header, and the
// array of the states of the rows of each collection, in visual order, which
// keeps its identity, or changes only the positions of the rows that changed.
import type { Row, RowKey } from "./address.js";
import { defineOwn, sameItems } from "./data.js";
import type { Derived } from "./derived.js";
import type { Published } from "./publication.js";
import type { States } from "./states.js";
import type { Store } from "./tree.js";

// What the arrays read of the states of the rows.
type RowReader = { readonly get: (key: RowKey) => States | undefined };

// The states of the header and, per collection, those of its rows in visual
// order. With the rows whose states changed, a collection whose keys are the
// same keeps its array or changes only their positions; any other is built
// again from its order.
export const fieldStatesOf = (
  store: Store,
  previous: (Derived & { readonly rows: Published["rows"] }) | undefined,
  header: States,
  rowStates: RowReader,
  changed: ReadonlySet<Row>,
) => {
  const before = previous?.fieldStates;
  let same = before !== undefined;
  const arrays = new Map<string, readonly States[]>();
  for (const [name, rows] of store.collections) {
    const held = before?.[name] as readonly States[] | undefined;
    const kept = previous !== undefined && previous.rows[name] === rows.order;
    const array =
      kept && held !== undefined
        ? repositioned(held, rows.records.at, rowStates, changed)
        : inOrder(rows.order, rowStates, held);
    same &&= array === held;
    arrays.set(name, array);
  }
  if (header !== previous?.derivedHeader)
    for (const name of Object.keys(header)) same &&= before?.[name] === header[name];
  if (same) return before as Readonly<Record<string, unknown>>;
  const next = {};
  for (const name of Object.keys(header)) defineOwn(next, name, header[name]);
  for (const [name, array] of arrays) defineOwn(next, name, array);
  return Object.freeze(next);
};

// The array with the states of the changed rows it holds at their positions.
// A spread copies a frozen array far faster than slice.
const repositioned = (
  before: readonly States[],
  at: ReadonlyMap<RowKey, number>,
  rowStates: RowReader,
  changed: ReadonlySet<Row>,
) => {
  let next: States[] | undefined;
  for (const { key } of changed) {
    const position = at.get(key);
    if (position === undefined) continue;
    next ??= [...before];
    next[position] = rowStates.get(key) as States;
  }
  return next === undefined ? before : Object.freeze(next);
};
const inOrder = (
  order: readonly RowKey[],
  rowStates: RowReader,
  before: readonly States[] | undefined,
) => {
  const next = Array.from(order, (key) => rowStates.get(key) as States);
  return before !== undefined && sameItems(before, next) ? before : Object.freeze(next);
};
