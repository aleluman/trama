// The states and the keys a session publishes. A form without collections
// publishes the states of its fields as before; one with collections adds, per
// collection, the states of each row and its keys, in visual order. Every
// object keeps its identity while its content does not change.
import type { Row, RowKey } from "./address.js";
import { noRowMap, type RowMap } from "./row-maps.js";
import type { Compiled } from "./compiled.js";
import type { StateFormula } from "./rules.js";
import { combineStates, type Contributions, type States } from "./states.js";
import { allRows, lockedStates, someRows } from "./row-states.js";
import type { Store } from "./tree.js";
import { defineOwn } from "./data.js";

// The states contributions combine, before validation and dirty derive what a
// session publishes (see derived.ts).
export type Published = {
  readonly headerStates: States;
  readonly rowStates: RowMap<States>;
  readonly rows: Readonly<Record<string, readonly RowKey[]>>;
  // Per collection, the states of a row that no formula of its own reaches:
  // those it declares, with the lock. Rows share them.
  readonly locked: ReadonlyMap<string, States>;
};
// What an operation changed of the states: the formulas of state whose
// contribution changed, and the rows it added and removed. Without it, as at
// opening and restore, every state combines again.
export type Affected = {
  readonly replaced: readonly StateFormula[];
  readonly added: readonly Row[];
  readonly removed: readonly Row[];
};
const noRows = Object.freeze({});
const noLocked: ReadonlyMap<string, States> = new Map();

// The header combines again when a contribution to it changed, and so does a
// row; a change of the lock reaches every row. Adding or removing rows always
// changes their keys. With the states, the rows whose states changed, or
// undefined when every row combined again.
export const publishStates = (
  compiled: Compiled,
  store: Store,
  contributions: Contributions,
  published: Published | undefined,
  affected: Affected | undefined,
): Published & { readonly recombined: ReadonlySet<Row> | undefined } => {
  const rows = publishRows(store, published?.rows);
  if (published === undefined || affected === undefined)
    return combineAll(compiled, store, contributions, published, rows);
  const { replaced, added, removed } = affected;
  const { headerStates: held, rowStates: heldRows, locked } = published;
  if (replaced.length === 0 && rows === published.rows)
    return { headerStates: held, rowStates: heldRows, rows, locked, recombined: noRecombined };
  if (replaced.some((formula) => compiled.locks.includes(formula)))
    return combineAll(compiled, store, contributions, published, rows);
  const headerStates = replaced.some((formula) => formula.row === undefined)
    ? combineStates(compiled, compiled.states, contributions, held)
    : held;
  if (compiled.collections.size === 0)
    return { headerStates, rowStates: heldRows, rows, locked, recombined: noRecombined };
  const { states, changed } = someRows(
    compiled,
    contributions,
    published,
    replaced,
    added,
    removed,
  );
  return { headerStates, rowStates: states, rows, locked, recombined: changed };
};
const noRecombined: ReadonlySet<Row> = new Set();

const combineAll = (
  compiled: Compiled,
  store: Store,
  contributions: Contributions,
  published: Published | undefined,
  rows: Published["rows"],
) => {
  const headerStates = combineStates(
    compiled,
    compiled.states,
    contributions,
    published?.headerStates,
  );
  if (compiled.collections.size === 0)
    return {
      headerStates,
      rowStates: noRowMap<States>(),
      rows,
      locked: noLocked,
      recombined: undefined,
    };
  const locked = lockedStates(compiled, contributions, published?.locked);
  const rowStates = allRows(compiled, store, contributions, locked, published);
  return { headerStates, rowStates, rows, locked, recombined: undefined };
};

const publishRows = (store: Store, previous: Published["rows"] | undefined) => {
  if (store.collections.size === 0) return noRows;
  let same = previous !== undefined;
  for (const [name, rows] of store.collections) same &&= previous?.[name] === rows.order;
  if (same) return previous as Published["rows"];
  const next = {};
  for (const [name, rows] of store.collections) defineOwn(next, name, rows.order);
  return Object.freeze(next);
};
