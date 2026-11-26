// What a change reaches. Every formula and observer is indexed by the
// addresses it read last, so an operation visits only the fields its roots
// reach through their readers, in the order of the traversal, instead of
// every field of every row. A field no change reaches would not run its
// formula: its reads are the same as before.
import type { Address, Field, Row } from "./address.js";
import type { Step } from "./cycles.js";
import { sameAddresses, type Reads } from "./reads.js";
import type { FieldFormula, Observer } from "./rules.js";

// The formulas of value and the observers that read each address. A copy
// shares the sets of readers of the original, and copies one only to change it:
// owned holds the sets it may change.
export type Readers = {
  readonly formulas: Map<Address, Set<FieldFormula>>;
  readonly observers: Map<Address, Set<Observer>>;
  readonly owned: WeakSet<object>;
};
export const noReaders = (): Readers => ({
  formulas: new Map(),
  observers: new Map(),
  owned: new WeakSet(),
});
export const copyReaders = (readers: Readers): Readers => ({
  formulas: new Map(readers.formulas),
  observers: new Map(readers.observers),
  owned: new WeakSet(),
});

// Replaces the reads of a reader in its index: it leaves the addresses it no
// longer reads and joins those it reads now. The same reads in the same order,
// the common case, change nothing. Without owned, every set is the index's own.
export const track = <R>(
  index: Map<Address, Set<R>>,
  reader: R,
  before: Reads | undefined,
  after: Reads | undefined,
  owned?: WeakSet<object>,
) => {
  if (before !== undefined && after !== undefined && sameAddresses(before, after)) return;
  const own = (address: Address, readers: Set<R>) => {
    if (owned === undefined || owned.has(readers)) return readers;
    const copy = new Set(readers);
    owned.add(copy);
    index.set(address, copy);
    return copy;
  };
  if (before !== undefined)
    for (const address of before.keys()) {
      const found = after?.has(address) === true ? undefined : index.get(address);
      if (found === undefined) continue;
      if (found.size === 1 && found.has(reader)) index.delete(address);
      else own(address, found).delete(reader);
    }
  if (after !== undefined)
    for (const address of after.keys()) {
      if (before?.has(address) === true) continue;
      const found = index.get(address);
      if (found === undefined) {
        const readers = new Set([reader]);
        owned?.add(readers);
        index.set(address, readers);
      } else own(address, found).add(reader);
    }
};

// The readers of an address whose row is still held: those of a row the
// operation removes are still indexed until it commits, and leave with it. A
// reader of the header, or an output, has no row.
export const readersOf = <R extends object>(
  index: ReadonlyMap<Address, ReadonlySet<R>>,
  address: Address,
  holds: (row: Row) => boolean,
  visit: (reader: R) => void,
) => {
  for (const reader of index.get(address) ?? []) {
    const { row } = reader as { readonly row?: Row | undefined };
    if (row === undefined || holds(row)) visit(reader);
  }
};

// The candidates of an operation. Each attempt starts its pending top-level
// steps: the events with priority, before every field, and then the field of
// each candidate and right after it its event, in the order of the traversal.
export type Reach = {
  readonly candidates: Set<Field>;
  start(priority: readonly Step[]): Worklist;
  // Joins a destination revealed outside the candidates, with the fields that
  // read it, transitively, to the candidates and the pending steps. Returns the
  // earliest position at which the whole traversal settled one of them before
  // the step at, if any: it settles a field no change reaches at its own
  // position or when it reads it to check whether a formula runs, which reads
  // in turn everything that field read before.
  widen(field: Field, at: number, settled: ReadonlyMap<Step, number>): number | undefined;
};
// How the traversal places a step, and the event of a field, if any.
export type Placement = {
  position(step: Step): number;
  eventOf(field: Field): Step | undefined;
};

export const reachOf = (
  readers: Readers,
  roots: Iterable<Address>,
  placement: Placement,
  holds: (row: Row) => boolean,
): Reach => {
  const candidates = new Set<Field>();
  let pending: Worklist;
  const join = (field: Field) => {
    pending.push(field);
    const event = placement.eventOf(field);
    if (event !== undefined) pending.push(event);
  };
  spread(readers.formulas, roots, candidates, holds, () => {});
  return {
    candidates,
    start: (priority) => {
      pending = worklist(placement.position);
      priority.forEach((event, index) => pending.push(event, index - priority.length));
      for (const field of candidates) join(field);
      return pending;
    },
    widen: (field, at, settled) => {
      if (candidates.has(field)) return;
      let earliest: number | undefined;
      spread(readers.formulas, [field], candidates, holds, (found) => {
        join(found);
        // A candidate may have read it after its own position.
        const position = Math.min(settled.get(found) ?? Infinity, placement.position(found));
        if (position <= at && (earliest === undefined || position < earliest)) earliest = position;
      });
      return earliest;
    },
  };
};

// Adds the roots that are fields, and the field of every formula that reads a
// candidate, transitively, each once; a structure is no field, but its readers
// are.
const spread = (
  formulas: ReadonlyMap<Address, ReadonlySet<FieldFormula>>,
  roots: Iterable<Address>,
  candidates: Set<Field>,
  holds: (row: Row) => boolean,
  found: (field: Field) => void,
) => {
  const queue: Address[] = [];
  const join = (address: Address) => {
    if (typeof address !== "string" && address.kind === "structure") queue.push(address);
    else if (!candidates.has(address)) {
      candidates.add(address);
      found(address);
      queue.push(address);
    }
  };
  for (const root of roots) join(root);
  for (let next = 0; next < queue.length; next++)
    readersOf(formulas, queue[next] as Address, holds, (formula) => join(formula.address));
};

// The pending steps, a binary heap by position: the first to pop is the
// earliest in the traversal. A step goes at its own position unless given one.
export type Worklist = {
  push(step: Step, position?: number): void;
  pop(): { readonly step: Step; readonly position: number } | undefined;
};
const worklist = (position: (step: Step) => number): Worklist => {
  const steps: Step[] = [];
  const keys: number[] = [];
  const swap = (a: number, b: number) => {
    const step = steps[a] as Step;
    const key = keys[a] as number;
    steps[a] = steps[b] as Step;
    keys[a] = keys[b] as number;
    steps[b] = step;
    keys[b] = key;
  };
  return {
    push: (step, at = position(step)) => {
      let index = steps.length;
      steps.push(step);
      keys.push(at);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if ((keys[parent] as number) <= (keys[index] as number)) break;
        swap(index, parent);
        index = parent;
      }
    },
    pop: () => {
      if (steps.length === 0) return;
      const first = { step: steps[0] as Step, position: keys[0] as number };
      const last = steps.length - 1;
      swap(0, last);
      steps.pop();
      keys.pop();
      for (let index = 0; ;) {
        const left = 2 * index + 1;
        const right = left + 1;
        let least = index;
        if (left < last && (keys[left] as number) < (keys[least] as number)) least = left;
        if (right < last && (keys[right] as number) < (keys[least] as number)) least = right;
        if (least === index) break;
        swap(index, least);
        index = least;
      }
      return first;
    },
  };
};
