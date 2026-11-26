import { cycle, writerEdge, type Step } from "./cycles.js";
import type { FieldEvent } from "./rules.js";

// How an attempt goes back. Its top-level steps are the events with priority
// and then every field in order, each followed by its event. When an event
// reveals a destination the attempt already settled, a new attempt would redo
// unchanged every top-level step before the first one that settled it, so the
// attempt goes back to that step instead. An event that gets priority changes
// the first step, so a new attempt starts.

// The steps an attempt settled, each with the top-level step it settled in, in
// the order they settled; the top-level step it is in; and the one it must go
// back to, or Infinity; again starts a new attempt. It goes back whatever error
// unwinds it: a rule may catch the restart, or throw instead a failure it read
// before. Top-level steps are numbers in order: indices of the whole traversal,
// or positions over candidates.
export type Trail = {
  readonly settled: Map<Step, number>;
  readonly trail: Step[];
  at: number;
  from: number;
};

// Unwinds an attempt that must go back; as an Error, a rule that catches it
// still fails.
export const restart = new Error("The candidate starts again");
// The step before every step: going back to it starts a new attempt.
export const again = -Infinity;

// A step settles in the top-level step the attempt is in. A field that completes
// without its writer event settles twice, in the same one.
export const settle = (trail: Trail, step: Step) => {
  trail.settled.set(step, trail.at);
  trail.trail.push(step);
};

// Undoes every step settled from the top-level step to go back to on, latest
// first, and goes on from that step.
export const goBack = <T extends Trail>(current: T, forget: (current: T, step: Step) => void) => {
  const { trail, settled, from } = current;
  for (let step = trail.at(-1); step !== undefined; step = trail.at(-1)) {
    const at = settled.get(step);
    if (at !== undefined && at < from) break;
    trail.pop();
    settled.delete(step);
    forget(current, step);
  }
  current.at = from;
  current.from = Infinity;
};

// A cycle through a writer event may come from a destination it no longer
// writes: the attempt opens with that event, which then reads the field while
// it settles, as a writer skipped. Each event gets priority once; an attempt
// that must go back does not choose another one.
export const reroot = (
  current: Trail & { readonly learnt: { priority: readonly FieldEvent[] } },
  stack: readonly Step[],
  step: Step,
): never => {
  if (current.from !== Infinity) throw restart;
  const { learnt } = current;
  const event = writerEdge(stack, step, learnt.priority);
  if (event === undefined) throw cycle(stack, step);
  learnt.priority = [event, ...learnt.priority];
  current.from = again;
  throw restart;
};
