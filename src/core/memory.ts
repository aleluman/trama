// What the engine keeps across operations, and what an operation is.
import type { Address, Destination, Field, Row, RowKey } from "./address.js";
import type { Compiled } from "./compiled.js";
import { copyReaders, noReaders, track, type Readers } from "./invalidation.js";
import { applyParams, paramsDelta, type ParamsDelta } from "./param-memory.js";
import type { ParamsFormula } from "./params.js";
import type { PublishedStates } from "./published.js";
import { sameReads, type Reads } from "./reads.js";
import type { FieldFormula, Observer, StateFormula } from "./rules.js";
import type { Contribution, Contributions } from "./states.js";
import type { Store } from "./tree.js";

export type { Params } from "./param-memory.js";
// Reads observed per formula and the readers of each address they index, the
// contribution of each active formula of state, the params of each async field
// and those of each query. Only a committed operation changes them, in place.
// While the reads, the readers and the contributions are shared with the
// opening, which reset brings back, the first operation that changes them
// copies them; the params are those of the state in force alone.
export type Memory = {
  readonly dependencies: Map<FieldFormula | Observer, Reads>;
  readonly readers: Readers;
  readonly contributions: Map<StateFormula, Contribution>;
  readonly params: Map<Field, object | undefined>;
  readonly queryParams: Map<Field, object | undefined>;
  readonly shared: boolean;
};
export type State = Memory & PublishedStates & { readonly store: Store };
// The opening, whose supplied values prevail, or a change, with the store
// before it, the addresses it writes or whose structure it changes, the values
// it supplies, which prevail as well, and the rows it adds or removes.
// Restore resolves nothing.
export type Operation =
  | { readonly kind: "open"; readonly supplied: (address: Field) => boolean }
  | {
      readonly kind: "change";
      readonly previous: Store;
      // The store events read as before, when it is not previous: the start
      // of a batch of responses that applies one by one.
      readonly eventBefore?: Store | undefined;
      // The store dirty compares with.
      readonly baseline: Store;
      // What the operation wrote; for a command, every field it wrote.
      readonly roots: readonly Address[];
      // The direct edits of a command in a form with onEdit: each field it
      // changed, with the value it stores.
      readonly edited?: ReadonlyMap<Field, unknown> | undefined;
      readonly supplied?: ((address: Field) => boolean) | undefined;
      readonly added?: readonly Row[] | undefined;
      readonly removed?: readonly Row[] | undefined;
      // Whether its resolution reports the last writer of each field.
      readonly track?: boolean | undefined;
    };
export type Change = Extract<Operation, { readonly kind: "change" }>;
// What an operation did, which the outputs and the queries follow: the
// addresses whose values it changed, undefined at opening and restore, which
// change them all; the rows it added and the keys of those it removed, which
// a publication keeps without keeping the rows; what each new row was given,
// at opening, restore and add; and the params of queries it wrote. An
// operation without effect did nothing, whatever the one before did.
export type Receipt = {
  readonly changed: ReadonlySet<Address> | undefined;
  readonly added: readonly Row[];
  readonly removed: readonly RowKey[];
  readonly supplied: ((address: Field) => boolean) | undefined;
  readonly queried: ReadonlyMap<Field, unknown> | undefined;
};
export const none: readonly never[] = Object.freeze([]);
// What a change without effect did.
export const nothing: Receipt = Object.freeze({
  changed: new Set<never>(),
  added: none,
  removed: none,
  supplied: undefined,
  queried: undefined,
});
// What a prepared records: the engine that captured it, the reset epoch and
// the sequence of its prepare, its state, the revision then, and the fields
// whose query had not arrived: one in flight or failed.
export type PreparedRecord = {
  readonly owner: object;
  readonly epoch: number;
  readonly seq: number;
  readonly state: State;
  readonly since: number;
  readonly unsettled: ReadonlySet<Field>;
};
// Where the messages of a response to a prepared may go: its sequence, and
// whether a destination changed after preparing.
export type Placing = {
  readonly seq: number;
  readonly changed: (destination: Destination) => boolean;
};
export type WriterKind = "formula" | "change" | "edit";
// The state of an operation, what it did when it is a change and, when it
// tracks them, the last writer of each field in its resolution.
export type Observed = {
  readonly state: State;
  readonly receipt: Receipt | undefined;
  readonly writers?: ReadonlyMap<Field, WriterKind> | undefined;
};

// What an operation changes of the memory, undefined where it forgets: the
// reads of formulas of value and of observers, the contributions that changed
// and the params. It applies only once the operation commits, so a rejected
// one leaves nothing.
export type Delta = {
  readonly formulas: Map<FieldFormula, Reads | undefined>;
  readonly observers: Map<Observer, Reads | undefined>;
  readonly contributions: Map<StateFormula, Contribution | undefined>;
  readonly params: ParamsDelta;
};

// The delta of an operation starts with the reads of its resolution. The rules
// of the rows it removes leave with them, and so do their params.
export const deltaOf = (
  memory: Memory,
  change: Change | undefined,
  reads: ReadonlyMap<FieldFormula, Reads>,
): Delta => {
  const delta: Delta = {
    formulas: new Map(reads),
    observers: new Map(),
    contributions: new Map(),
    params: paramsDelta(change === undefined),
  };
  for (const row of change?.removed ?? []) leave(memory, delta, row);
  return delta;
};
const leave = (memory: Memory, delta: Delta, row: Row) => {
  for (const template of row.collection.formulas.values()) {
    const instance = row.instances.get(template) as FieldFormula | undefined;
    if (instance !== undefined && memory.dependencies.has(instance))
      delta.formulas.set(instance, undefined);
  }
  for (const template of row.collection.states) {
    const instance = row.instances.get(template) as StateFormula | undefined;
    if (instance === undefined) continue;
    if (memory.dependencies.has(instance)) delta.observers.set(instance, undefined);
    if (memory.contributions.has(instance)) delta.contributions.set(instance, undefined);
  }
  for (const template of row.collection.params) {
    const instance = row.instances.get(template) as ParamsFormula | undefined;
    if (instance === undefined) continue;
    if (memory.dependencies.has(instance)) delta.observers.set(instance, undefined);
    delta.params.removed.push(instance);
  }
};

// Nothing is observed before opening.
export const unobserved = (): Memory => ({
  dependencies: new Map(),
  readers: noReaders(),
  contributions: new Map(),
  params: new Map(),
  queryParams: new Map(),
  shared: false,
});
// The memory a session works on after opening or reset. A form with
// collections copies the opening memory there, where every row is already
// reached, so that no change pays for all of them; a form without collections
// shares it until a change copies it, which costs less than a copy at each
// reset.
export const workingMemory = (compiled: Compiled, opened: Memory): Memory =>
  compiled.collections.size === 0 ? { ...opened, shared: true } : copyMemory(opened);
export const copyMemory = (memory: Memory): Memory => ({
  ...memory,
  dependencies: new Map(memory.dependencies),
  readers: copyReaders(memory.readers),
  contributions: new Map(memory.contributions),
  shared: false,
});

// A state without params, as a baseline keeps it: those in force are the
// session's, and change in place.
export const withoutParams = <S extends Memory>(state: S): S => ({
  ...state,
  params: new Map(),
  queryParams: new Map(),
});

// The contributions as the delta leaves them, read before it applies; the
// delta withdraws a contribution with undefined. A delta that changes none
// reads those in force, and one over no contributions, as at opening, holds
// them all: it withdraws only what the memory holds.
export const contributionsAfter = (memory: Memory, delta: Delta): Contributions => {
  const changed = delta.contributions;
  const held = memory.contributions;
  if (changed.size === 0) return held;
  if (held.size === 0) return changed;
  return { get: (formula) => (changed.has(formula) ? changed.get(formula) : held.get(formula)) };
};

// Applies a delta and returns the memory it applied to. Reads equal to those in
// place change nothing, so a delta that changes nothing, as a reset usually
// does, leaves shared maps shared.
export const applyDelta = (memory: Memory, delta: Delta): Memory => {
  let target = memory;
  const own = () => {
    if (target.shared) target = copyMemory(target);
    return target;
  };
  const depend = <R extends FieldFormula | Observer>(
    index: (readers: Readers) => Map<Address, Set<R>>,
    reader: R,
    reads: Reads | undefined,
  ) => {
    const before = target.dependencies.get(reader);
    if (
      reads === undefined ? before === undefined : before !== undefined && sameReads(before, reads)
    )
      return;
    const { dependencies, readers } = own();
    track(index(readers), reader, before, reads, readers.owned);
    if (reads === undefined) dependencies.delete(reader);
    else dependencies.set(reader, reads);
  };
  for (const [formula, reads] of delta.formulas) depend((r) => r.formulas, formula, reads);
  for (const [observer, reads] of delta.observers) depend((r) => r.observers, observer, reads);
  for (const [formula, contribution] of delta.contributions)
    if (contribution === undefined) own().contributions.delete(formula);
    else own().contributions.set(formula, contribution);
  const { params } = delta;
  if (params.whole) return { ...target, params: params.params, queryParams: params.queryParams };
  applyParams(params, target.params, target.queryParams);
  return target;
};
