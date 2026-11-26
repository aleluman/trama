// The operations that change marks: touching an address, replacing the
// inputs of its views, and replacing what a source gives some destinations.
// Each derives those addresses again, as if written, without changing any
// value. Its receipt says nothing changed, so no query, output or revision
// follows it, and it cancels no prepare; the counts follow its states. Marks
// that would not change give nothing.
import type { Destination, Field } from "./address.js";
import type { Compiled } from "./compiled.js";
import { sameItems } from "./data.js";
import {
  markAt,
  sourced,
  untouched,
  withMark,
  type Channel,
  type Mark,
  type Marks,
} from "./marks.js";
import type { Change, Receipt, State } from "./memory.js";
import { observed } from "./observation.js";
import { unresolved } from "./operation.js";
import type { Marking } from "./published.js";
import type { Given } from "./reads.js";
import type { Store } from "./tree.js";

type Place = { readonly current: State; readonly baseline: Store };

// The operations of an engine, given where it is and how it commits.
export const markers = <P>(
  compiled: Compiled,
  given: Given,
  at: () => Place,
  commit: (state: State, receipt: Receipt) => P,
) => {
  const marked = (marking: Marking | undefined) => {
    if (marking === undefined) return;
    const { current, baseline } = at();
    const operation: Change = { kind: "change", previous: current.store, baseline, roots: [] };
    const ran = observed(
      compiled,
      given,
      operation,
      current.store,
      current,
      unresolved,
      current,
      marking,
    );
    return commit(ran.state, ran.receipt as Receipt);
  };
  const remarked = (address: Field, change: Partial<Mark>) =>
    marked(remark(at().current.marks, address, change));
  return {
    touch: (address: Field) => remarked(address, { touched: true }),
    input: (address: Field, inputs: readonly string[]) => remarked(address, { inputs }),
    external: (
      source: number,
      channel: Channel,
      lists: ReadonlyMap<Destination, readonly string[]>,
      before: Iterable<Destination>,
    ) => marked(sourced(at().current.marks, source, channel, lists, before)),
  };
};

const remark = (marks: Marks, address: Field, change: Partial<Mark>): Marking | undefined => {
  const before = markAt(marks, address) ?? untouched;
  const mark = { ...before, ...change };
  if (mark.touched === before.touched && sameItems(mark.inputs, before.inputs)) return;
  return { marks: withMark(marks, address, mark), addresses: new Set([address]) };
};
