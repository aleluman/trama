// The state of each scope above the fields: a row, a collection and the form.
// Each has its own messages, which formulas of no field give, and those its
// sources give it from outside the rules, and counts the destinations in it
// with some message, local or external: its fields and itself, and the scopes
// it holds. It is dirty when a value in it differs from the baseline, when it
// is a row the baseline lacks, or, for a collection, when its rows differ in
// order or membership. An operation updates only the rows whose states or
// messages changed, by difference; opening and restore count everything.
import { formScope, isRow, type Own as Scope, type Row } from "./address.js";
import type { Compiled } from "./compiled.js";
import { defineOwn, sameItems } from "./data.js";
import { keptItems, merged, type External, type Marks } from "./marks.js";
import { editRowMap, noRowMap, type RowMap } from "./row-maps.js";
import type { StateFormula } from "./rules.js";
import { messagesOf, ownOf, silent, type Own } from "./scope-messages.js";
import type { Contributions, States } from "./states.js";
import type { Store } from "./tree.js";

export type ScopeState = {
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly dirty: boolean;
};
// The engine publishes the form unattempted; the session marks the attempt.
// It has inputs pending while a view reports a text it could not convert.
export type FormState = ScopeState & {
  readonly attempted: boolean;
  readonly inputPending: boolean;
  readonly collections: Readonly<Record<string, ScopeState>>;
};
// What the rows of a collection add to it, and whether its rows differ from
// the baseline.
type Tally = {
  readonly errors: number;
  readonly warnings: number;
  readonly dirty: number;
  readonly moved: boolean;
};
export type Scopes = {
  readonly form: FormState;
  readonly rowScopes: RowMap<ScopeState>;
  readonly tallies: ReadonlyMap<string, Tally>;
};
// What an operation counts from: its stores, the states it published, those
// before, its contributions, the messages whose contribution changed, the rows
// whose counts may have changed, the rows removed, the collections whose order
// changed, whether it counts everything, and its marks, which it compares with
// those before to find the scopes whose externals changed.
export type Counting = {
  readonly store: Store;
  readonly baseline: Store;
  readonly derivedHeader: States;
  readonly derivedRows: RowMap<States>;
  readonly previous:
    | (Scopes & { readonly derivedHeader: States; readonly marks: Marks })
    | undefined;
  readonly contributions: Contributions;
  readonly messages: readonly StateFormula[];
  readonly rows: ReadonlySet<Row>;
  readonly removed: readonly Row[];
  readonly structure: ReadonlySet<string>;
  readonly all: boolean;
  readonly marks: Marks;
};

const none: readonly string[] = Object.freeze([]);
const quiet: ScopeState = Object.freeze({
  errors: none,
  externalErrors: none,
  warnings: none,
  errorCount: 0,
  warningCount: 0,
  dirty: false,
});

export const countScopes = (compiled: Compiled, counting: Counting): Scopes => {
  const { previous } = counting;
  const inputPending = counting.marks.inputs > 0;
  // A change of inputs always derives a field again, so it is never uncounted.
  if (previous !== undefined && !counting.all && uncounted(counting)) return previous;
  const { rowScopes, tallies } = countRows(counting);
  const { marks } = counting;
  const header = tallyOf(counting.derivedHeader);
  const collections: Record<string, ScopeState> = {};
  let errorCount = header.errors;
  let warningCount = header.warnings;
  let dirty = header.dirty > 0;
  for (const [name, { structure }] of compiled.collections) {
    const tally = tallies.get(name) as Tally;
    const own = ownOf(compiled.own, counting.contributions, name);
    const dirtied = tally.moved || tally.dirty > 0;
    const scope = scopeOf(own, externalOf(marks, structure), tally.errors, tally.warnings, dirtied);
    defineOwn(collections, name, kept(scope, counting.previous?.form.collections[name]));
    errorCount += scope.errorCount;
    warningCount += scope.warningCount;
    dirty ||= scope.dirty;
  }
  const own = ownOf(compiled.own, counting.contributions);
  const before = previous?.form;
  const external = externalOf(marks, formScope);
  const scope = kept(scopeOf(own, external, errorCount, warningCount, dirty), before);
  const same =
    before !== undefined &&
    Object.keys(collections).every((name) => before.collections[name] === collections[name]);
  const form =
    same && scope === before && before.inputPending === inputPending
      ? before
      : Object.freeze({
          ...scope,
          attempted: false,
          inputPending,
          collections: same ? before.collections : Object.freeze(collections),
        });
  return { form, rowScopes, tallies };
};
// Whether an operation changed nothing a scope counts: no state of the header,
// no row, no message, no structure, no external of a scope above the fields;
// then it keeps the counts. The marks keep the map of those externals while
// nothing in it changes.
const uncounted = (counting: Counting) =>
  counting.previous?.derivedHeader === counting.derivedHeader &&
  counting.previous.marks.own === counting.marks.own &&
  counting.rows.size === 0 &&
  counting.removed.length === 0 &&
  counting.structure.size === 0 &&
  counting.messages.length === 0;
// The externals of a scope above the fields.
const externalOf = (marks: Marks, scope: Scope) => marks.own.get(scope);

// The counts of the fields of a scope, once per object of states, which rows
// alike share, and the header while it does not change.
const fieldTallies = new WeakMap<States, Omit<Tally, "moved">>();
const tallyOf = (states: States) => {
  let found = fieldTallies.get(states);
  if (found === undefined) fieldTallies.set(states, (found = countFields(states)));
  return found;
};
const countFields = (states: States) => {
  let errors = 0;
  let warnings = 0;
  let dirty = 0;
  for (const name in states) {
    const state = states[name] as States[string];
    if (state.errors.length > 0 || state.externalErrors.length > 0) errors++;
    if (state.warnings.length > 0) warnings++;
    if (state.dirty === true) dirty++;
  }
  return { errors, warnings, dirty };
};

// The scope of each row whose states or messages changed, and the tallies of
// their collections, by difference; every row when counting everything.
const countRows = (counting: Counting) => {
  const { store, baseline, derivedRows, previous, all } = counting;
  if (store.collections.size === 0)
    return { rowScopes: noRowMap<ScopeState>(), tallies: noTallies };
  const before = previous?.rowScopes;
  const touched = all || before === undefined ? allRows(store) : rowsOf(counting);
  const tallies = new Map(all || previous === undefined ? [] : previous.tallies);
  for (const name of store.collections.keys()) if (!tallies.has(name)) tallies.set(name, zero);
  const rowScopes = editRowMap(all || before === undefined ? noRowMap<ScopeState>() : before);
  const add = (collection: string, scope: ScopeState | undefined, sign: number) => {
    if (scope === undefined) return;
    const tally = tallies.get(collection) as Tally;
    tallies.set(collection, {
      ...tally,
      errors: tally.errors + sign * scope.errorCount,
      warnings: tally.warnings + sign * scope.warningCount,
      dirty: tally.dirty + sign * Number(scope.dirty),
    });
  };
  for (const row of touched) {
    const held = before?.get(row.key);
    const states = derivedRows.get(row.key);
    if (states === undefined) {
      if (held === undefined) continue;
      rowScopes.delete(row.key);
      if (!all) add(row.collection.name, held, -1);
      continue;
    }
    const scope = kept(rowScope(row, states, counting, isNew(baseline, row)), held);
    if (!all && scope === held) continue;
    rowScopes.set(row.key, scope);
    if (!all) add(row.collection.name, held, -1);
    add(row.collection.name, scope, 1);
  }
  for (const name of all ? store.collections.keys() : counting.structure) {
    const tally = tallies.get(name) as Tally;
    tallies.set(name, { ...tally, moved: moved(store, baseline, name) });
  }
  return { rowScopes: rowScopes.done(), tallies };
};
const zero: Tally = { errors: 0, warnings: 0, dirty: 0, moved: false };
const noTallies: ReadonlyMap<string, Tally> = new Map();

// The rows an operation may change the scope of: those whose states changed,
// those of messages of rows whose contribution changed, those whose own
// externals changed, and the removed ones.
const rowsOf = ({ messages, rows, removed, previous, marks }: Counting) => {
  const touched = new Set<Row>(removed);
  for (const row of rows) touched.add(row);
  for (const formula of messages)
    if (formula.own?.kind === "row" && formula.row !== undefined) touched.add(formula.row);
  const before = previous?.marks.own;
  if (before !== undefined && before !== marks.own) {
    for (const [scope, external] of marks.own)
      if (isRow(scope) && before.get(scope) !== external) touched.add(scope);
    for (const scope of before.keys())
      if (isRow(scope) && !marks.own.has(scope)) touched.add(scope);
  }
  return touched;
};
const allRows = (store: Store) => {
  const rows: Row[] = [];
  for (const collection of store.collections.values())
    for (const row of collection.created) rows.push(row);
  return rows;
};
// A row: its messages, and its fields with some message.
const rowScope = (row: Row, states: States, counting: Counting, created: boolean) => {
  const { contributions, marks } = counting;
  const own =
    row.collection.own.length === 0
      ? silent
      : messagesOf(
          row.collection.own.map((template) => row.instances.get(template) as StateFormula),
          contributions,
        );
  const tally = tallyOf(states);
  const external = externalOf(marks, row);
  return scopeOf(own, external, tally.errors, tally.warnings, created || tally.dirty > 0);
};
const isNew = (baseline: Store, row: Row) =>
  baseline.collections.get(row.collection.name)?.rows.has(row.key) !== true;
const moved = (store: Store, baseline: Store, name: string) =>
  !sameItems(
    store.collections.get(name)?.order ?? none,
    baseline.collections.get(name)?.order ?? none,
  );

// A scope with its own messages, the external ones, whose warnings go after
// its own, and the destinations it holds with some message; itself counts once.
const scopeOf = (
  own: Own,
  external: External | undefined,
  errors: number,
  warnings: number,
  dirty: boolean,
): ScopeState => {
  const externalErrors = external?.errors ?? none;
  const joinedWarnings =
    external === undefined ? own.warnings : merged(own.warnings, external.warnings);
  return {
    errors: own.errors,
    externalErrors,
    warnings: joinedWarnings,
    errorCount: errors + Number(own.errors.length > 0 || externalErrors.length > 0),
    warningCount: warnings + Number(joinedWarnings.length > 0),
    dirty,
  };
};
// The scope before when it has the same content, or the new one frozen.
// A list of messages keeps the object before while its items are the same.
const kept = (scope: ScopeState, before: ScopeState | undefined): ScopeState => {
  if (
    before !== undefined &&
    before.errorCount === scope.errorCount &&
    before.warningCount === scope.warningCount &&
    before.dirty === scope.dirty &&
    sameItems(before.errors, scope.errors) &&
    sameItems(before.externalErrors, scope.externalErrors) &&
    sameItems(before.warnings, scope.warnings)
  )
    return before;
  if (scope.errorCount + scope.warningCount === 0 && !scope.dirty) return quiet;
  return Object.freeze({
    ...scope,
    errors: keptItems(scope.errors, before?.errors),
    externalErrors: keptItems(scope.externalErrors, before?.externalErrors),
    warnings: keptItems(scope.warnings, before?.warnings),
  });
};
