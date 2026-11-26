import { givenOf, type Context, type Given } from "./baseline.js";
import { added, edited, editsOf, moved, opening, patched, removed } from "./candidates.js";
import type { Compiled } from "./compiled.js";
import {
  nothing,
  unobserved,
  workingMemory,
  type Change,
  type Receipt,
  type State,
} from "./memory.js";
import { run } from "./operation.js";
import { evaluateOutputs, type OutputEvaluations, type OutputReaders } from "./outputs.js";
import type { Engine, FormDefinition, Publication } from "./engine-types.js";
import { markers } from "./marking.js";
import { accepted, captured, placing, restored, revised, savingOf, tracking } from "./saving.js";
import { readerOf, sourceOf, type Candidate, type Store } from "./tree.js";
export type { Engine, Publication, Receipt } from "./engine-types.js";
export type { Params } from "./memory.js";

// The opening creates the engine, so there is no engine without opened values.
// Each operation evaluates a candidate and commits it, with what it changed of
// the memory, only when every rule succeeded; a rejected operation leaves
// nothing behind. The operations work on the memory of the opening, which
// reset brings back (see workingMemory). The defaults of the form run once,
// before initial is checked.
export const openEngine = <D extends FormDefinition>(
  compiled: Compiled,
  initial: unknown,
  context: Context,
): { readonly opened: Publication<D>; readonly engine: Engine<D> } => {
  const given: Given = givenOf(compiled, context);
  const { candidate, supplied } = opening(compiled, given, initial);
  const memory = unobserved();
  const opened = {
    ...run(compiled, given, { kind: "open", supplied }, candidate, memory).state,
    shared: true,
  };
  const engine = engineOf<D>(compiled, given, opened, supplied);
  // The engine does not retain the opening publication once the session takes it.
  return { opened: engine.opening, engine: engine.operations };
};

// Every operation prepares outputs over its committed values (see outputsOf).
// An operation without effect publishes the current state again, with a
// receipt of nothing. Restore gives the rows of the baseline what they were
// given at opening, or, after a commit, every field it holds (see saving.ts).
const engineOf = <D extends FormDefinition>(
  compiled: Compiled,
  given: Given,
  opened: State,
  supplied: NonNullable<Receipt["supplied"]>,
) => {
  let current: State = { ...opened, ...workingMemory(compiled, opened) };
  const saving = savingOf(opened, supplied);
  const evaluate = outputsOf<D>(compiled, given, opened);
  const commit = (next: State, receipt: Receipt) => {
    current = next;
    return evaluate(next, receipt);
  };
  // While a prepared may be accepted, each change records its revisions: an
  // add writes explicitly only the fields it was given; any other command, all.
  // Once none can, the first change of a value drops them.
  const change: Changer<D> = (candidate, operation) => {
    if (candidate === undefined) return commit(current, nothing);
    const previous = current.store;
    const track = tracking(saving);
    const applied: Change = {
      ...operation,
      kind: "change",
      previous,
      baseline: saving.baseline.store,
      track,
    };
    const ran = run(compiled, given, applied, candidate, current, current);
    revised(saving, track, ran, operation.supplied ?? always);
    return commit(ran.state, ran.receipt as Receipt);
  };
  const operations: Engine<D> = {
    ...commands<D>(compiled, () => current.store, change),
    restore: () => commit(...restored(compiled, given, saving, current)),
    capture: (unsettled) => {
      const found = captured(saving, current, unsettled);
      current = found.current;
      return found.record;
    },
    accept: (prepared, canonical) => {
      const live = accepted(compiled, given, saving, current, prepared, canonical);
      return live && commit(live.state, live.receipt);
    },
    ...markers(compiled, given, () => ({ current, baseline: saving.baseline.store }), commit),
    placing: (prepared, command) => placing(saving, prepared, command),
  };
  return { opening: commit(current, saving.reopened), operations };
};

// The outputs of each operation over its committed values: those that read
// what it changed, or every output when it does not say, as at opening and
// reset.
const outputsOf = <D extends FormDefinition>(compiled: Compiled, given: Given, opened: State) => {
  let outputs: OutputEvaluations = new Map();
  const readers: OutputReaders = new Map();
  // The reader of the current store, kept while an operation changes nothing.
  let reader = { store: opened.store, read: readerOf(opened.store) };
  return (next: State, receipt: Receipt) => {
    const { store } = next;
    if (reader.store !== store) reader = { store, read: readerOf(store) };
    outputs = evaluateOutputs(
      compiled.outputs,
      () => sourceOf(compiled, store.values, store.collections),
      {
        previous: outputs,
        context: given.context,
        read: reader.read,
        changed: receipt.changed,
        readers,
      },
    );
    return publicationOf<D>(next, outputs, receipt);
  };
};
const always = () => true;
type Changer<D extends FormDefinition> = (
  candidate: Candidate | undefined,
  operation: Pick<Change, "roots" | "supplied" | "added" | "removed" | "edited" | "eventBefore">,
) => Publication<D>;

// The operations of the engine but restore and those of saving, each a change
// of the current store
// with its roots: the fields it writes, or the structure of a collection, with
// the fields of the rows an add creates.
const commands = <D extends FormDefinition>(
  compiled: Compiled,
  store: () => Store,
  change: Changer<D>,
): Pick<Engine<D>, "edit" | "patch" | "respond" | "add" | "remove" | "move"> => ({
  edit: (name, value) => {
    const field = String(name);
    const candidate = edited(compiled, store(), name, value);
    const edits = candidate && editsOf(compiled)?.set(field, candidate.values[field]);
    return change(candidate, { roots: [field], edited: edits });
  },
  patch: (writes) => {
    const edits = editsOf(compiled);
    return change(patched(compiled, store(), writes, edits), {
      roots: [...writes.keys()],
      edited: edits,
    });
  },
  respond: (writes, before) =>
    change(patched(compiled, store(), writes), {
      roots: [...writes.keys()],
      eventBefore: before,
    }),
  add: (collection, rows, at) => {
    const { candidate, created, supplied, roots } = added(store(), collection, rows, at);
    const publication = change(candidate, { roots, supplied, added: created });
    return { publication, keys: created.map((row) => row.key) };
  },
  remove: (collection, rows) =>
    change(removed(store(), collection, rows), { roots: [collection.structure], removed: rows }),
  move: (collection, row, to) =>
    change(moved(store(), collection, row, to), { roots: [collection.structure] }),
});

const publicationOf = <D extends FormDefinition>(
  state: State,
  outputs: OutputEvaluations,
  receipt: Receipt,
): Publication<D> =>
  ({
    values: state.store.values,
    fieldStates: state.fieldStates,
    rows: state.rows,
    outputs,
    params: state.params,
    queryParams: state.queryParams,
    store: state.store,
    rowStates: state.derivedRows,
    form: state.form,
    rowScopes: state.rowScopes,
    receipt,
  }) as Publication<D>;
