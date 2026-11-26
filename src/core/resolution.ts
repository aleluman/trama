import type { Address, Field } from "./address.js";
import { isEvent, type Step } from "./cycles.js";
import type { Reach } from "./invalidation.js";
import type { WriterKind } from "./memory.js";
import { formulaAt, store, type Pass, type Program } from "./program.js";
import type { Reads } from "./reads.js";
import { again, goBack } from "./restarts.js";
import type { FieldFormula } from "./rules.js";
import { patchOf, resolve, type Attempt, type Learnt } from "./steps.js";

// What a resolution leaves: the reads of the formulas it ran and the fields it
// wrote, each with its value at the start of the operation and, when the pass
// tracks them, which kind of writer wrote it last in the completed attempt,
// even if that write left the value unchanged.
export type Resolution = {
  readonly reads: ReadonlyMap<FieldFormula, Reads>;
  readonly written: ReadonlyMap<Field, unknown>;
  readonly writers?: ReadonlyMap<Field, WriterKind> | undefined;
};

// Values resolve upstream before their consumers, and each destination runs its
// writers in declaration order, so the last one that writes prevails. An event
// is known as a writer only once it reveals a destination. If the attempt had
// already settled that field, it goes back with what the operation learnt.
// A destination may come from an invocation the event no longer makes, so a
// field whose writer event is still settling completes without it, whether it
// reached the event or the event read it; that patch then must not write the
// field. Rules read the draft itself, so going back restores in place the
// fields it forgets; going back before every step starts a new attempt.
// A change with a reach visits only its candidates, each where the whole
// traversal does; any other field would settle without running anything.
export const resolveValues = (program: Program, pass: Pass, reach?: Reach): Resolution => {
  const learnt = learntOf();
  for (;;) {
    const current = attemptOf(program, pass, learnt, reach);
    const { priority } = learnt;
    try {
      const pending =
        reach === undefined ? traversal(priority, program.steps()) : candidates(reach, priority);
      const reads = attempt(current, pending);
      return { reads, written: learnt.overwritten, writers: current.writers };
    } catch (error) {
      if (current.from !== again) throw error;
      for (const [address, value] of learnt.overwritten) store(current, address, value);
    }
  }
};

const learntOf = (): Learnt => ({
  targets: new Map(),
  invoked: new Map(),
  overwritten: new Map(),
  priority: [],
});

// A read of the structure of a collection resolves nothing, and a read of a
// row the candidate no longer holds returns gone, which no value equals.
const gone = Symbol("gone");
const attemptOf = (program: Program, pass: Pass, learnt: Learnt, reach: Reach | undefined) => {
  const current: Attempt = {
    program,
    values: program.values,
    formulas: program.formulas,
    pass,
    learnt,
    read: (address: Address) => {
      if (typeof address === "string") return resolve(current, address);
      if (address.kind === "structure") return program.get(address);
      return program.holds(address.row) ? resolve(current, address) : gone;
    },
    stack: [],
    settled: new Map(),
    trail: [],
    at: 0,
    from: Infinity,
    failures: new Map(),
    patches: new Map(),
    deferred: new Map(),
    reads: new Map(),
    cursors: new Map(),
    reach,
    writers: pass.track ? new Map() : undefined,
  };
  return current;
};

// The top-level steps an attempt has left: next gives the following one and
// places the attempt at it; back returns to a step after going back.
type Pending = {
  next(current: Attempt): Step | undefined;
  back(from: number): void;
};

// The events with priority, then every field in order, and right after it the
// event of that field, each at its index.
const traversal = (priority: readonly Step[], order: readonly Step[]): Pending => {
  let index = 0;
  return {
    next: (current) => {
      const step = index < priority.length ? priority[index] : order[index - priority.length];
      current.at = index++;
      return step;
    },
    back: (from) => {
      index = from;
    },
  };
};

// The candidates, after the events with priority, each top-level step at its
// position in the traversal. Going back visits again those from there on.
const candidates = (reach: Reach, priority: readonly Step[]): Pending => {
  const pending = reach.start(priority);
  const visited: { readonly step: Step; readonly position: number }[] = [];
  return {
    next: (current) => {
      const next = pending.pop();
      if (next === undefined) return;
      visited.push(next);
      current.at = next.position;
      return next.step;
    },
    back: (from) => {
      for (let last = visited.at(-1); last !== undefined && last.position >= from;) {
        pending.push(last.step, last.position);
        visited.pop();
        last = visited.at(-1);
      }
    },
  };
};

// Failures do not stop the attempt: a later event may reveal a destination and
// discard it. An attempt that must go back stops at once and goes on from that
// step, without the failures from there on; a complete one rejects with its
// first failure. A field no change reaches settles only when a candidate reads
// it, and never fails.
const attempt = (current: Attempt, pending: Pending) => {
  let failure: { readonly error: unknown; readonly at: number } | undefined;
  for (let step = pending.next(current); step !== undefined; step = pending.next(current)) {
    try {
      if (isEvent(step)) patchOf(current, step);
      else resolve(current, step);
    } catch (error) {
      if (current.from === Infinity) failure ??= { error, at: current.at };
      else if (current.from === again) throw error;
      else {
        if (failure !== undefined && failure.at >= current.from) failure = undefined;
        pending.back(current.from);
        goBack(current, forget);
      }
    }
  }
  if (failure !== undefined) throw failure.error;
  return current.reads;
};

// What going back undoes of a step. A field also returns to its value at the
// start of the operation, since only its own resolution writes it. Its cursor
// and the patch of an event stay: the step sets them again before reading them.
const forget = (current: Attempt, step: Step) => {
  current.failures.delete(step);
  if (isEvent(step)) {
    current.deferred.delete(step);
    return;
  }
  const formula = formulaAt(current, step);
  if (formula !== undefined) current.reads.delete(formula);
  current.writers?.delete(step);
  const { overwritten } = current.learnt;
  if (overwritten.has(step)) store(current, step, overwritten.get(step));
};
