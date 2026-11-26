// How an attempt settles its steps: a field by its writers, in declaration
// order, and an event by its patch, which may reveal destinations.
import { annotate, type Deferred, type Field, type Step } from "./cycles.js";
import type { Reach } from "./invalidation.js";
import type { WriterKind } from "./memory.js";
import { store, valueAt, type Invocation, type Pass, type Patch, type Program } from "./program.js";
import { unchanged, type Read, type Reads } from "./reads.js";
import { reroot, restart, settle, type Trail } from "./restarts.js";
import type { FieldEvent, FieldFormula } from "./rules.js";

// What an operation learns across its attempts: the fields each event writes,
// the last invocation of each event with the values it read, the events that
// open each attempt, the latest first, and the value each field it wrote had
// at its start.
export type Learnt = {
  readonly targets: Map<Field, readonly FieldEvent[]>;
  readonly invoked: Map<FieldEvent, Invocation>;
  readonly overwritten: Map<Field, unknown>;
  priority: readonly FieldEvent[];
};
// The writers of a field that settles and the next one to apply. A read of the
// field while it waits on one of its writer events completes it.
type Writer = FieldFormula | FieldEvent;
type Cursor = { readonly writers: readonly Writer[]; at: number };
// One attempt of the candidate: fields and events settle once, a failure
// settles them too, and whoever reads them afterwards receives that failure.
// Going back forgets what each step from there on recorded, and only the reads
// of the formulas it ran outlive it, if it completes. An attempt over the
// candidates of a change has their reach.
export type Attempt = Trail & {
  readonly program: Program;
  // The values and formulas of the header, which a field of the header reads
  // and writes by its name.
  readonly values: Record<string, unknown>;
  readonly formulas: Program["formulas"];
  readonly pass: Pass;
  readonly learnt: Learnt;
  readonly read: Read;
  readonly stack: Step[];
  readonly failures: Map<Step, unknown>;
  readonly patches: Map<FieldEvent, Patch | undefined>;
  readonly deferred: Map<FieldEvent, Deferred[]>;
  readonly reads: Map<FieldFormula, Reads>;
  readonly cursors: Map<Field, Cursor>;
  readonly reach: Reach | undefined;
  // The kind of last writer of each field the attempt wrote, when
  // the pass tracks them.
  readonly writers: Map<Field, WriterKind> | undefined;
};

// Settles a step once: an event, or a field that completes without its writer
// event. An event is only reached again as a writer, and written skips it.
const visit = (current: Attempt, step: Step, work: () => void) => {
  if (current.failures.has(step)) throw current.failures.get(step);
  if (current.settled.has(step)) return;
  current.stack.push(step);
  try {
    work();
  } catch (error) {
    current.failures.set(step, error);
    throw error;
  } finally {
    current.stack.pop();
    settle(current, step);
  }
};

// The hottest path: a field of the header reads its name in place. A field no
// change reaches keeps its value: its formula would not run.
export const resolve = (current: Attempt, name: Field): unknown => {
  const { stack, settled, failures } = current;
  const header = typeof name === "string";
  if (failures.has(name)) throw failures.get(name);
  if (settled.has(name)) return header ? current.values[name] : current.program.get(name);
  if (current.reach?.candidates.has(name) === false) {
    settle(current, name);
    return header ? current.values[name] : current.program.get(name);
  }
  if (stack.includes(name)) return reenter(current, name);
  stack.push(name);
  try {
    const formula = header ? current.formulas.get(name) : current.program.rowFormula(name);
    const events = current.learnt.targets.get(name);
    // Only a field with a writer event may wait on one, so only it has a cursor.
    if (events === undefined) {
      if (formula !== undefined) write(current, name, propose(current, formula), formula);
    } else {
      const writers = formula === undefined ? events : insert<Writer>(events, formula);
      const cursor: Cursor = { writers, at: 0 };
      current.cursors.set(name, cursor);
      advance(current, name, cursor);
      if (failures.has(name)) throw failures.get(name);
    }
  } catch (error) {
    failures.set(name, error);
    throw error;
  } finally {
    stack.pop();
    settle(current, name);
  }
  return header ? current.values[name] : current.program.get(name);
};

// Applies the writers of a field from its cursor on, in declaration order.
const advance = (current: Attempt, name: Field, cursor: Cursor) => {
  for (let writer = cursor.writers[cursor.at]; writer !== undefined;) {
    const value = "handler" in writer ? written(current, writer, name) : propose(current, writer);
    if (current.settled.has(name)) return;
    write(current, name, value, writer);
    writer = cursor.writers[++cursor.at];
  }
};

// The only write to a destination; undefined is no write.
const write = (current: Attempt, name: Field, value: unknown, writer: Writer) => {
  const { pass, learnt } = current;
  if (value === undefined || !pass.writes(name)) return;
  if (!learnt.overwritten.has(name)) learnt.overwritten.set(name, valueAt(current, name));
  store(current, name, pass.adopt(name, value));
  const { writers } = current;
  if (writers === undefined) return;
  // A later onChange keeps the mark of an onEdit: both are explicit, and what
  // an onEdit writes counts for commit even with the same value.
  const kind = "handler" in writer ? (writer.edit ? "edit" : "change") : "formula";
  if (kind !== "change" || writers.get(name) !== "edit") writers.set(name, kind);
};

// A field read again while it settles. If it waits on a writer event, it
// completes without that event, whose patch then must not write it, and goes
// back on the stack so that paths through it show it. Otherwise it is a cycle,
// unless it crosses a writer event that reroot can open the attempt with.
const reenter = (current: Attempt, name: Field) => {
  const { stack } = current;
  const cursor = current.cursors.get(name);
  const writer = cursor?.writers[cursor.at];
  if (cursor !== undefined && writer !== undefined && "handler" in writer) {
    annotate(current.deferred, { event: writer, name, stack: [...stack], step: name });
    cursor.at++;
    visit(current, name, () => advance(current, name, cursor));
    return valueAt(current, name);
  }
  return reroot(current, stack, name);
};

// What an event writes to a destination. One still settling is skipped, and
// the field settles without it.
const written = (current: Attempt, event: FieldEvent, name: Field) => {
  const { stack } = current;
  if (!stack.includes(event)) return patchOf(current, event)?.get(name);
  annotate(current.deferred, { event, name, stack: [...stack], step: event });
};

const propose = ({ pass, read, reads }: Attempt, formula: FieldFormula): unknown => {
  const evaluation = pass.evaluate(formula, read);
  if (evaluation !== undefined) reads.set(formula, evaluation.reads);
  return evaluation?.value;
};

// Writers stay in declaration order: the value formula of the field and the
// events that revealed it as a destination.
const insert = <W extends Writer>(writers: readonly W[], writer: W) => {
  const at = writers.findIndex((other) => other.order > writer.order);
  return at === -1 ? [...writers, writer] : [...writers.slice(0, at), writer, ...writers.slice(at)];
};

// An event runs once per attempt, when the pass fires it: an onChange after
// its field settles, an onEdit without waiting for it.
export const patchOf = (current: Attempt, event: FieldEvent) => {
  visit(current, event, () => {
    const fires = current.pass.fires(event, () => resolve(current, event.address));
    const patch = fires ? invoke(current, event) : undefined;
    current.patches.set(event, patch);
    if (patch === undefined) return;
    // A patch, invoked or reused, that writes a field settled without it closes a
    // cycle, unless its path crosses another writer event without priority.
    for (const deferred of current.deferred.get(event) ?? [])
      if (patch.has(deferred.name)) reroot(current, deferred.stack, deferred.step);
    reveal(current, event, patch);
  });
  return current.patches.get(event);
};

// An attempt reuses the previous invocation when every value it read is the
// same, so an event runs again only after it saw a value that later changed.
const invoke = (current: Attempt, event: FieldEvent) => {
  const { pass, learnt, read } = current;
  const previous = learnt.invoked.get(event);
  if (previous !== undefined && unchanged(previous.reads, read)) return previous.patch;
  const invocation = pass.invoke(event, read);
  learnt.invoked.set(event, invocation);
  return invocation.patch;
};

// A destination the attempt already settled, or is settling, may have been
// consumed with its previous value: the attempt goes back to the earliest
// top-level step that settled one of them. Over candidates, a destination no
// change reached joins them, and the attempt goes back to where the whole
// traversal settled it, if it did before this step.
const reveal = (current: Attempt, event: FieldEvent, patch: Patch) => {
  const { learnt, reach } = current;
  for (const name of patch.keys()) {
    const writers = learnt.targets.get(name) ?? [];
    if (writers.includes(event)) continue;
    learnt.targets.set(name, insert(writers, event));
    const at = current.settled.get(name) ?? (current.stack.includes(name) ? current.at : undefined);
    if (at !== undefined) current.from = Math.min(current.from, at);
    const virtual = reach?.widen(name, current.at, current.settled);
    if (virtual !== undefined) current.from = Math.min(current.from, virtual);
  }
  if (current.from !== Infinity) throw restart;
};
