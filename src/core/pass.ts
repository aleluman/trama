// How a resolution treats the formulas and events of one operation: which
// formulas run, how events run and whether they may, which writes prevail, and
// what a write stores.
import { definitionAt, type Address, type Field, type Row } from "./address.js";
import { adopt } from "./fields.js";
import type { Compiled } from "./compiled.js";
import { evaluateEvent, evaluateFormula, type RowBefore } from "./evaluation.js";
import type { Change, Memory, Operation } from "./memory.js";
import type { Pass } from "./program.js";
import type { Context, Given, Read } from "./reads.js";
import type { FieldEvent, FieldFormula } from "./rules.js";
import type { Source } from "./views.js";
import {
  holds,
  recordIn,
  sourceOf,
  valueAt,
  type Candidate,
  type RowRecord,
  type Store,
} from "./tree.js";

// Whether a formula of value runs; events have their check in the pass, and
// observers and outputs run when they read an address the change changed.
// Opening runs every formula, so each one records its reads. A change runs the
// formulas whose reads changed, and those without reads: the formulas of the
// rows it adds.
const activation = (change: Change | undefined, memory: Memory) => {
  if (change === undefined) return () => false;
  const { values, collections } = change.previous;
  return (formula: FieldFormula, read: Read) => {
    const reads = memory.dependencies.get(formula);
    if (reads === undefined) return true;
    for (const address of reads.keys()) {
      const before =
        typeof address === "string" ? values[address] : valueAt(values, collections, address);
      if (!Object.is(read(address), before)) return true;
    }
    return false;
  };
};

// A form without relations runs a formula of value when a read changed, and
// every formula at opening.
const valueEvaluation = (
  operation: Operation,
  memory: Memory,
  source: Source,
  context: Context,
): Pass["evaluate"] => {
  const changed = activation(operation.kind === "change" ? operation : undefined, memory);
  return (formula, read) =>
    operation.kind === "open" || changed(formula, read)
      ? evaluateFormula(formula, source, read, context)
      : undefined;
};

// A formula of a relation also runs when its command wrote its field, with
// the same value too: the roots of a command are every field it wrote. A
// relation generates onEdit, so a command has edited.
const relationEvaluation = (
  operation: Operation,
  memory: Memory,
  source: Source,
  context: Context,
): Pass["evaluate"] => {
  const evaluate = valueEvaluation(operation, memory, source, context);
  if (operation.kind !== "change" || operation.edited === undefined) return evaluate;
  let written: Set<Address> | undefined;
  return (formula, read) =>
    formula.related === true && (written ??= new Set(operation.roots)).has(formula.address)
      ? evaluateFormula(formula, source, read, context)
      : evaluate(formula, read);
};

// The pass of a resolution over a candidate. Supplied values prevail: those of
// initial at opening, and those of the rows an add creates.
export const passOf = (
  compiled: Compiled,
  given: Given,
  operation: Operation,
  candidate: Candidate,
  memory: Memory,
): Pass => {
  const change = operation.kind === "change" ? operation : undefined;
  const source = sourceOf(compiled, candidate.values, candidate.collections);
  const supplied = operation.supplied;
  return {
    evaluate: (compiled.hasRelations ? relationEvaluation : valueEvaluation)(
      operation,
      memory,
      source,
      given.context,
    ),
    invoke: eventsOf(compiled, given, source, change),
    writes: (address) => supplied === undefined || !supplied(address),
    // An onEdit runs when its command edited its field, without settling it.
    // An onChange runs when its field settles with a value other than the one
    // before the operation. Opening, restore and the fields of a row the
    // operation adds run none.
    fires: (event, settle) => {
      if (event.edit) return change?.edited?.has(event.address) === true;
      const value = settle();
      if (change === undefined) return false;
      const { address } = event;
      const { values, collections } = change.previous;
      return typeof address === "string"
        ? !Object.is(value, values[address])
        : holds(collections, address.row) &&
            !Object.is(value, valueAt(values, collections, address));
    },
    // Opening writes each field at most once, while the draft still holds its
    // start: it needs no copy of the draft.
    adopt: adoption(compiled, change?.previous ?? candidate, candidate),
    track: change?.track === true,
  };
};

const eventsOf = (compiled: Compiled, given: Given, source: Source, change: Change | undefined) => {
  const before = (change?.eventBefore ?? change?.previous) as Store;
  let priorRows: Map<Row, RowBefore> | undefined;
  let written: Set<Address> | undefined;
  const prior = (row: Row | undefined) => {
    if (row === undefined) return before.values;
    priorRows ??= new Map();
    let found = priorRows.get(row);
    if (found === undefined) {
      const rows = before.collections.get(row.collection.name);
      const record = rows && recordIn(rows.records, row.key);
      found = Object.freeze({ row: record as RowRecord, values: before.values });
      priorRows.set(row, found);
    }
    return found;
  };
  return (event: FieldEvent, read: Read) => {
    const edit = event.edit
      ? { address: event.address, value: change?.edited?.get(event.address) }
      : undefined;
    const invocation = evaluateEvent(compiled, event, source, read, given, prior(event.row), edit);
    // An onEdit never writes what its command wrote, also with the same value.
    const { patch } = invocation;
    if (edit !== undefined && patch !== undefined) {
      written ??= new Set(change?.roots);
      for (const address of patch.keys()) if (written.has(address)) patch.delete(address);
    }
    return invocation;
  };
};

// What a write of the resolution stores. An option keeps the one the field
// held at the start of the operation or holds in the draft when their value
// is the same. Any other is copied once per field and operation, so an attempt
// that starts again writes the same copy, and a field never takes the option
// that another one kept: fields of the header by name, and fields of rows by
// address, so a row never takes the option of another row. The copies are
// kept by the object written, so writing one object to every row keeps one map.
const adoption = (compiled: Compiled, start: Store | Candidate, draft: Candidate) => {
  const copies = new WeakMap<object, Map<Field, unknown>>();
  return (address: Field, value: unknown) => {
    if (typeof value !== "object" || value === null) return value;
    let copied = copies.get(value);
    if (copied === undefined) {
      copied = new Map();
      copies.set(value, copied);
    }
    const held = [
      valueAt(start.values, start.collections, address),
      valueAt(draft.values, draft.collections, address),
    ];
    const item = definitionAt(compiled.fields, address);
    const written = adopt(item, copied.get(address) ?? value, held);
    copied.set(address, written);
    return written;
  };
};
