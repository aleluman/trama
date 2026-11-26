// One operation of the engine: it resolves the values of a candidate, commits
// them, runs the observers and combines the states. A rejected operation leaves
// nothing behind: the candidate and the delta of the memory are discarded.
import { keysGiven, span } from "./address.js";
import type { Compiled } from "./compiled.js";
import { reachOf } from "./invalidation.js";
import { workingMemory, type Memory, type Observed, type Operation, type State } from "./memory.js";
import { observed } from "./observation.js";
import { passOf } from "./pass.js";
import { placementOf, programOf } from "./program.js";
import type { Given } from "./reads.js";
import { resolveValues, type Resolution } from "./resolution.js";
import { commit, emptyStore, type Candidate } from "./tree.js";

// Resolves and commits the candidate, then observes it. The published state is
// the one a field keeps its object against. A change visits only what its
// roots reach, while the positions of its traversal are exact.
export const run = (
  compiled: Compiled,
  given: Given,
  operation: Operation,
  candidate: Candidate,
  memory: Memory,
  published?: State,
): Observed => {
  const change = operation.kind === "change" ? operation : undefined;
  const previous = change?.previous ?? emptyStore;
  const pass = passOf(compiled, given, operation, candidate, memory);
  const program = programOf(compiled, candidate);
  const reach =
    change !== undefined && exact(compiled)
      ? reachOf(memory.readers, change.roots, placementOf(compiled), program.holds)
      : undefined;
  const resolution = resolveValues(program, pass, reach);
  const store = commit(candidate, previous);
  return observed(compiled, given, change, store, memory, resolution, published);
};

// Positions stay exact while the rows of a collection, up to the last
// sequence given, fit in the span between collections, and the collections
// fit in a number.
const exact = (compiled: Compiled) => {
  if (compiled.collections.size >= 256) return false;
  for (const collection of compiled.collections.values())
    if ((keysGiven() + 1) * collection.width >= span) return false;
  return true;
};

// The opening state again, whose values are published as they are, with the
// opening memory (see workingMemory). Every formula of state runs again and
// replaces its reads and contribution; params equal to the current ones keep
// them.
export const restore = (compiled: Compiled, given: Given, opened: State, current: State) =>
  observed(
    compiled,
    given,
    undefined,
    opened.store,
    {
      ...workingMemory(compiled, opened),
      params: current.params,
      queryParams: current.queryParams,
    },
    unresolved,
    current,
  );
// The resolution of an operation that resolves nothing.
export const unresolved: Resolution = { reads: new Map(), written: new Map() };
