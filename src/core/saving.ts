// What the engine of a session keeps to reset and to accept a prepared: the
// baseline and what reset supplies, the reset epoch, the sequence of the last
// prepare and of the last one accepted, and the revisions while a prepared may
// be accepted. A reset moves to another epoch, where no prepared before it is
// accepted, and drops the revisions. Once the last prepared is accepted no
// change records any, and the first one that changes a value drops them (see
// tracking and revised): until then they still tell what changed after each
// prepared.
import { accept } from "./acceptance.js";
import { isRow, type Address, type Field } from "./address.js";
import type { Compiled } from "./compiled.js";
import {
  copyMemory,
  nothing,
  withoutParams,
  type Observed,
  type Placing,
  type PreparedRecord,
  type Receipt,
  type State,
} from "./memory.js";
import { restore } from "./operation.js";
import { canonicalPatch } from "./patches.js";
import { recordOf } from "./prepared.js";
import type { Given } from "./reads.js";
import { createRevisions, type Revisions } from "./revisions.js";
import { holds, type Store } from "./tree.js";

type Saving = {
  baseline: State;
  reopened: Receipt;
  epoch: number;
  seq: number;
  accepted: number;
  // Whether no value changed since the last one accepted: until then a
  // response to it may still place its messages.
  fresh: boolean;
  // The number of what the commit of the last one accepted wrote.
  served: number;
  revisions: Revisions | undefined;
};

export const savingOf = (opened: State, supplied: (address: Field) => boolean): Saving => ({
  baseline: withoutParams(opened),
  reopened: { ...nothing, changed: undefined, supplied },
  epoch: 0,
  seq: 0,
  accepted: 0,
  fresh: false,
  served: 0,
  revisions: undefined,
});

export const restored = (compiled: Compiled, given: Given, saving: Saving, current: State) => {
  const { state } = restore(compiled, given, saving.baseline, current);
  saving.epoch += 1;
  saving.revisions = undefined;
  return [state, saving.reopened] as const;
};

// The memory in force moves to a copy, and the prepared keeps the maps before,
// which nothing mutates any more: prepare pays the copy, not the next edit.
export const captured = (saving: Saving, current: State, unsettled: ReadonlySet<Field>) => {
  saving.revisions ??= createRevisions();
  const record: PreparedRecord = {
    owner: saving,
    epoch: saving.epoch,
    seq: ++saving.seq,
    state: { ...current, shared: true },
    since: saving.revisions.now(),
    unsettled,
  };
  return { record, current: { ...current, ...copyMemory(current) } };
};

const noAddresses: ReadonlySet<Address> = new Set();

// Accepts a prepared of this engine: undefined when it is older than a reset
// or than the last one accepted. Its canonical values are checked first, and
// a failure changes nothing, nor consumes it. What the commit writes is of
// the server: it records no revision, only what a response to another
// prepared needs to know.
export const accepted = (
  compiled: Compiled,
  given: Given,
  saving: Saving,
  current: State,
  prepared: unknown,
  canonical: unknown,
) => {
  const record = recordOf(prepared, saving);
  if (record === undefined) throw new Error("commit: prepared belongs to another session");
  const { collections } = record.state.store;
  const writes = canonicalPatch(compiled.fields, compiled.collections, canonical, {
    row: (collection, key) => collections.get(collection.name)?.rows.get(key),
  });
  const { revisions } = saving;
  if (record.epoch !== saving.epoch || record.seq <= saving.accepted || revisions === undefined)
    return;
  const { baseline, live } = accept(compiled, given, { current, revisions }, record, writes);
  saving.baseline = baseline;
  saving.reopened = reopenedAt(baseline.store, record.unsettled, writes);
  saving.accepted = record.seq;
  saving.fresh = true;
  saving.served = revisions.serve(live.receipt.changed ?? noAddresses);
  return live;
};

// Whether a change records its revisions: while some prepared may still be
// accepted.
export const tracking = (saving: Saving) =>
  saving.revisions !== undefined && saving.accepted !== saving.seq;
// What a change leaves of the revisions: its own, while they are tracked; or
// else none of them. A change can also record a field an onEdit wrote without
// changing it. An operation without effect does not get here.
export const revised = (
  saving: Saving,
  track: boolean,
  { receipt, writers }: Observed,
  explicit: (address: Field) => boolean,
) => {
  saving.fresh = false;
  if (track) saving.revisions?.record(receipt?.changed as ReadonlySet<Address>, writers, explicit);
  else saving.revisions = undefined;
};

// Where the messages of a response to a prepared of this engine may go: its
// sequence, and whether a destination changed after preparing, as an
// operation that would have withdrawn its messages: a field, by its revision,
// which a cell of a row added later has; a row, by those of its cells, or when
// the prepared did not hold it; and a collection, by that of its structure.
// The form never does. Undefined when the prepared is older than a reset or
// than a later one accepted, or, once accepted, when a value changed since.
export const placing = (
  saving: Saving,
  prepared: unknown,
  command: string,
): Placing | undefined => {
  const record = recordOf(prepared, saving);
  if (record === undefined) throw new Error(`${command}: prepared belongs to another session`);
  const { revisions } = saving;
  if (record.epoch !== saving.epoch || record.seq < saving.accepted || revisions === undefined)
    return;
  if (record.seq === saving.accepted && !saving.fresh) return;
  const { since } = record;
  const { collections } = record.state.store;
  // What its own commit wrote is of its server; that of another, a change.
  const own = record.seq === saving.accepted ? saving.served : 0;
  const after = (address: Address) =>
    revisions.changedAfter(address, since) || revisions.servedAfter(address, since, own);
  return {
    seq: record.seq,
    changed: (destination) => {
      if (isRow(destination)) {
        if (!holds(collections, destination)) return true;
        for (const address of destination.addresses.values()) if (after(address)) return true;
        return false;
      }
      if (typeof destination !== "string" && destination.kind === "form") return false;
      return after(destination);
    },
  };
};

// After a commit, reset supplies every field the baseline holds: no query asks
// again for what arrived confirmed. A query that had not arrived when
// preparing asks again, unless the server wrote its field.
const reopenedAt = (
  baseline: Store,
  unsettled: ReadonlySet<Field>,
  writes: ReadonlyMap<Field, unknown>,
): Receipt => ({
  ...nothing,
  changed: undefined,
  supplied: (address: Field) =>
    writes.has(address) ||
    (!unsettled.has(address) &&
      (typeof address === "string" || holds(baseline.collections, address.row))),
});
