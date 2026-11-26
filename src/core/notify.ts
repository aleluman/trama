// How a session publishes: its snapshot, and the lists, observers of outputs
// and listeners that hear each publication. Code of the application that runs
// meanwhile cannot operate on the session.
import { keysGiven, type Row } from "./address.js";
import type { FormDefinition, FormQueries } from "./definition.js";
import { remember, type KnownKeys } from "./known-keys.js";
import type { FormRows } from "./row-types.js";
import type { Publication, Receipt } from "./engine.js";
import type { OutputEvaluations } from "./outputs.js";
import type { Sources } from "./session-external.js";
import { noQueries } from "./queries.js";
import type { Snapshot } from "./session.js";

export type SessionState<D extends FormDefinition> = {
  snapshot: Snapshot<D>;
  // The last publication of the engine, with its outputs and params.
  published: Publication<D>;
  // The option lists that hear every publication, to follow their params.
  lists: Set<() => void>;
  listeners: Set<() => void>;
  outputObservers: Set<(outputs: OutputEvaluations) => void>;
  notifying: boolean;
  // The frontier of the last attempt, undefined since opening or reset: the
  // rows up to it existed then.
  attempt: number | undefined;
  // The rows touched since opening or reset, themselves or through a cell, and
  // a version that changes with them, which the snapshots of rows compare.
  touched: { readonly rows: WeakSet<Row>; version: number };
  // The keys the session gave its rows, also those of rows that left.
  known: KnownKeys;
  // The sources of messages from outside the rules, which a reset forgets.
  readonly sources: Sources;
  // What runs at the end of each publication, once everyone heard of it.
  settled: () => void;
};

export const stateOf = <D extends FormDefinition>(opened: Publication<D>): SessionState<D> => ({
  known: knownIn(opened),
  sources: new Map(),
  snapshot: Object.freeze({
    values: opened.values,
    fieldStates: opened.fieldStates,
    rows: opened.rows as FormRows<D>,
    resetVersion: 0,
    queries: noQueries as FormQueries<D>,
    form: opened.form as Snapshot<D>["form"],
  }),
  published: opened,
  lists: new Set(),
  listeners: new Set(),
  outputObservers: new Set(),
  notifying: false,
  attempt: undefined,
  touched: { rows: new WeakSet(), version: 0 },
  settled: () => {},
});

const knownIn = <D extends FormDefinition>(opened: Publication<D>) => {
  const known: KnownKeys = new Map();
  for (const { created } of opened.store.collections.values()) remember(known, created);
  return known;
};

// The queries follow each operation before it is published, as its receipt
// says, with the states they return; option lists follow their params before
// anyone hears of it.
export const publish = <D extends FormDefinition>(
  state: SessionState<D>,
  publication: Publication<D>,
  resetVersion: number,
  follow: (receipt: Receipt) => object,
): void => {
  const { values, fieldStates, outputs } = publication;
  const rows = publication.rows as FormRows<D>;
  const form = formOf(state, publication.form);
  state.published = publication;
  if (publication.receipt.added.length > 0) remember(state.known, publication.receipt.added);
  const queries = following(state, () => follow(publication.receipt)) as FormQueries<D>;
  state.snapshot = Object.freeze({ values, fieldStates, rows, resetVersion, queries, form });
  for (const list of Array.from(state.lists))
    if (state.lists.has(list)) notifyObserver(state, list);
  const listeners = Array.from(state.listeners);
  const observers = Array.from(state.outputObservers);
  // Each observer runs inside notifyObserver, which guards reentrant edits.
  for (const observer of observers) if (state.outputObservers.has(observer)) observer(outputs);
  for (const listener of listeners) notifyObserver(state, listener);
  state.settled();
};

// The form a snapshot publishes: the engine's, or a copy marked attempted,
// one per object of the engine.
const attempted = new WeakMap<object, object>();
const formOf = <D extends FormDefinition>(
  state: SessionState<D>,
  form: Publication<D>["form"],
): Snapshot<D>["form"] => {
  if (state.attempt === undefined) return form as Snapshot<D>["form"];
  let found = attempted.get(form);
  if (found === undefined)
    attempted.set(form, (found = Object.freeze({ ...form, attempted: true })));
  return found as Snapshot<D>["form"];
};

// Marks an attempt: its frontier is the last key given, so every row there is
// now attempted. The subscribers hear it when the form or a row changed: at
// the first attempt, or when a row of the session is newer than the last one.
// Keys given to other sessions, or to rows already removed, change nothing.
export const markAttempt = <D extends FormDefinition>(state: SessionState<D>) => {
  const previous = state.attempt;
  state.attempt = keysGiven();
  if (previous !== undefined && !createdAfter(state.published, previous)) return;
  state.snapshot = Object.freeze({
    ...state.snapshot,
    form: formOf(state, state.published.form),
  });
  notifyListeners(state);
};

// Whether a row of the publication is newer than the frontier: the rows of a
// collection keep their creation order, so its last one is its newest.
const createdAfter = <D extends FormDefinition>(published: Publication<D>, frontier: number) => {
  for (const { created } of published.store.collections.values())
    if ((created.at(-1)?.seq ?? 0) > frontier) return true;
  return false;
};

// A change in the states of the queries alone: the subscribers of the session
// hear a snapshot with the same values, the same snapshot when only the
// states of a row changed, which its handle publishes.
export const publishQueries = <D extends FormDefinition>(
  state: SessionState<D>,
  queries: object,
) => {
  if (queries !== state.snapshot.queries)
    state.snapshot = Object.freeze({ ...state.snapshot, queries: queries as FormQueries<D> });
  notifyListeners(state);
  state.settled();
};
// A change of the snapshot of a row alone, which its handle publishes: the
// subscribers hear the same snapshot of the session.
export const notifyListeners = <D extends FormDefinition>(state: SessionState<D>) => {
  for (const listener of Array.from(state.listeners)) notifyObserver(state, listener);
};
// The queries follow an operation inside the guard of notifications: a
// loader, an endpoint or the abort of a request run code of the application,
// which must not operate on the session while it publishes.
export const following = <D extends FormDefinition, T>(
  state: SessionState<D>,
  follow: () => T,
): T => {
  const notifying = state.notifying;
  state.notifying = true;
  try {
    return follow();
  } finally {
    state.notifying = notifying;
  }
};

export const notifyObserver = <D extends FormDefinition>(
  state: SessionState<D>,
  callback: () => void,
  onError?: (error: unknown) => void,
) => {
  const notifying = state.notifying;
  state.notifying = true;
  try {
    callback();
  } catch (error) {
    let reported = error;
    if (onError) {
      try {
        onError(error);
        return;
      } catch (cause) {
        reported = cause;
      }
    }
    if (typeof globalThis.reportError === "function") globalThis.reportError(reported);
    else
      setTimeout(() => {
        throw reported;
      }, 0);
  } finally {
    state.notifying = notifying;
  }
};

// Adds a listener to one of the sets of the session: its listeners, also
// through the handles of its rows, or its option lists.
export const subscriber = (listeners: Set<() => void>) => (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
// No operation runs while the session notifies.
export const guardOf =
  <D extends FormDefinition>(state: SessionState<D>) =>
  (operation: string) => {
    if (state.notifying) throw new Error(`Cannot ${operation} a session during its notification`);
  };
