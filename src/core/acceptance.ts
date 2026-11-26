// How the engine of a session accepts a prepared with the canonical values of
// its server. The new baseline is the prepared state with the canonical patch,
// resolved as a change of its own memory. The live state takes the canonical
// values only where nothing changed after preparing, and keeps as supplied the
// explicit writes after preparing that no formula replaced, so no cascade
// overwrites them. Both resolve before anything changes; the live one derives
// dirty again against the new baseline (see rebase.ts).
import type { Field } from "./address.js";
import { patched } from "./candidates.js";
import type { Compiled } from "./compiled.js";
import { withoutParams, type Change, type PreparedRecord, type State } from "./memory.js";
import { observed } from "./observation.js";
import { run, unresolved } from "./operation.js";
import type { Given } from "./reads.js";
import type { Revisions } from "./revisions.js";
import { holds } from "./tree.js";

export const accept = (
  compiled: Compiled,
  given: Given,
  { current, revisions }: { readonly current: State; readonly revisions: Revisions },
  record: PreparedRecord,
  writes: ReadonlyMap<Field, unknown>,
) => {
  const baseline = savedOf(compiled, given, record, writes);
  const { since } = record;
  const live = new Map<Field, unknown>();
  for (const [address, value] of writes)
    if (
      !revisions.changedAfter(address, since) &&
      (typeof address === "string" || holds(current.store.collections, address.row))
    )
      live.set(address, value);
  const change: Change = {
    kind: "change",
    previous: current.store,
    baseline: baseline.store,
    roots: [...live.keys()],
    supplied: (address) => revisions.explicitAfter(address, since),
  };
  const candidate = patched(compiled, current.store, live);
  const { state, receipt } =
    candidate === undefined
      ? observed(compiled, given, change, current.store, current, unresolved, current)
      : run(compiled, given, change, candidate, current, current);
  return { baseline, live: { state, receipt: receipt as NonNullable<typeof receipt> } };
};

// The prepared state with the canonical values, on its own memory, which the
// change copies before it writes: a failure leaves the prepared as it was. It
// derives against the baseline of the prepared, so it rebases nothing.
const savedOf = (
  compiled: Compiled,
  given: Given,
  { state }: PreparedRecord,
  writes: ReadonlyMap<Field, unknown>,
): State => {
  const candidate = patched(compiled, state.store, writes);
  if (candidate === undefined) return withoutParams(state);
  const roots = [...writes.keys()];
  const change: Change = { kind: "change", previous: state.store, baseline: state.baseline, roots };
  return withoutParams(run(compiled, given, change, candidate, withoutParams(state), state).state);
};
