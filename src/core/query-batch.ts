// The batch of the responses of a session: the outcomes of those that arrive
// before the close that the first one schedules, in a microtask, apply in one
// operation of the engine and publish once. The close checks each outcome
// again, in order of arrival, by generation and by revisions, and an accepted
// patch takes the fields it writes: a later one of the batch that writes one
// of them is discarded. Each entry takes its state before the queries follow
// the operation, so one that the operation starts again keeps its new
// generation. If the operation fails, each response applies on its own, in
// order of arrival, with its prepared patch and a publication of its own.
import type { Field } from "./address.js";
import type { Store } from "./tree.js";
import {
  failed,
  queryStates,
  release,
  revisedAfter,
  type Outcome,
  type Queries,
} from "./query-entries.js";

export const enqueue = (queries: Queries, outcome: Outcome) => {
  if (queries.batch.push(outcome) === 1) queueMicrotask(() => close(queries));
};

const close = (queries: Queries) => {
  const outcomes = queries.batch.splice(0);
  const before = queries.host.published().store;
  try {
    apply(queries, outcomes);
  } catch {
    for (const outcome of outcomes)
      try {
        apply(queries, [outcome], before);
      } catch (error) {
        release(queries, outcome.entry, failed(outcome.entry, "response operation failed", error));
        publishStates(queries);
      }
  }
};

// The outcomes that keep their generation take their states, and their
// accepted patches apply in one operation; without any, the states publish
// alone. It throws, changing nothing, when the operation fails.
const apply = (queries: Queries, outcomes: readonly Outcome[], before?: Store) => {
  const current = outcomes.filter((outcome) => isCurrent(outcome));
  if (current.length === 0) return;
  const settle = () => {
    for (const outcome of current)
      if (isCurrent(outcome)) release(queries, outcome.entry, outcome.state);
  };
  const { patch, accepted } = joined(queries, current);
  if (accepted) queries.host.commit(patch, settle, before);
  else {
    settle();
    publishStates(queries);
  }
};

const isCurrent = ({ entry, request }: Outcome) => entry.request === request;
// The union of the patches the close accepts: those whose fields did not
// change after their request started, nor were taken by an earlier one.
const joined = (queries: Queries, current: readonly Outcome[]) => {
  const patch = new Map<Field, unknown>();
  let accepted = false;
  for (const { patch: written, request } of current) {
    if (written === undefined || !free(queries, written, request.start, patch)) continue;
    for (const [address, value] of written) patch.set(address, value);
    accepted = true;
  }
  return { patch, accepted };
};
const free = (
  queries: Queries,
  written: ReadonlyMap<Field, unknown>,
  since: number,
  taken: ReadonlyMap<Field, unknown>,
) => {
  for (const address of written.keys())
    if (taken.has(address) || revisedAfter(queries, address, since)) return false;
  return true;
};

const publishStates = (queries: Queries) => {
  if (queryStates(queries)) queries.host.changed(queries.states);
};
