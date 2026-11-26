// What a resolution runs over: the top-level steps of an attempt and the
// values of the candidate. The steps are every field of the header, then each
// collection in declaration order, its rows in creation order and their fields
// in declaration order, each field followed by its event. The position of a
// row takes no part.
import { rowAddress, type Address, type Field, type Row } from "./address.js";
import { eventOf, formulaOf, type CompiledCollection } from "./collections.js";
import { isEvent, type Step } from "./cycles.js";
import type { Compiled } from "./compiled.js";
import type { Placement } from "./invalidation.js";
import type { FieldEvent, FieldFormula } from "./rules.js";
import type { Read, Reads } from "./reads.js";
import { holds, valueAt as treeValue, writeAt, type Candidate } from "./tree.js";

// What the engine gives a resolution: the top-level steps of an attempt, which
// only the whole traversal lists; the values of the header of the candidate,
// which rules read in place, and the formula of value of each field; and, for
// rows, how to read and write them. A row the candidate does not hold has no
// field to resolve.
export type Program = {
  steps(): readonly Step[];
  readonly values: Record<string, unknown>;
  readonly formulas: ReadonlyMap<string, FieldFormula>;
  rowFormula(address: Exclude<Field, string>): FieldFormula | undefined;
  get(address: Exclude<Address, string>): unknown;
  set(address: Exclude<Field, string>, value: unknown): void;
  holds(row: Row): boolean;
};
// How one operation treats a formula: its evaluation with the reads it
// observed, or undefined when the operation does not run it; the invocation
// of an event; whether its result may be written; whether a field changed for
// its event; and what a write stores.
export type Pass = {
  readonly evaluate: (
    formula: FieldFormula,
    read: Read,
  ) => { readonly value: unknown; readonly reads: Reads } | undefined;
  readonly invoke: (event: FieldEvent, read: Read) => Invocation;
  readonly writes: (address: Field) => boolean;
  // Whether an event runs; settle settles its field and gives its value.
  readonly fires: (event: FieldEvent, settle: () => unknown) => boolean;
  // The value a write stores, given the draft before it.
  readonly adopt: (address: Field, value: unknown) => unknown;
  // Whether the resolution keeps the last writer of each field it writes.
  readonly track: boolean;
};
export type Patch = ReadonlyMap<Field, unknown>;
export type Invocation = { readonly patch: Patch | undefined; readonly reads: Reads };
// The values of a candidate as a resolution reads them: a field of the header
// is its name in its values.
type Header = {
  readonly values: Record<string, unknown>;
  readonly formulas: Program["formulas"];
  readonly program: Program;
};
export const valueAt = (current: Header, field: Field) =>
  typeof field === "string" ? current.values[field] : current.program.get(field);
export const store = (current: Header, field: Field, value: unknown) => {
  if (typeof field === "string") current.values[field] = value;
  else current.program.set(field, value);
};
export const formulaAt = (current: Header, field: Field) =>
  typeof field === "string" ? current.formulas.get(field) : current.program.rowFormula(field);

const headers = new WeakMap<Compiled, readonly Step[]>();
// Every field of the header in the order of the draft, as every draft of a
// form holds its fields, and right after it the event of that field.
const headerSteps = (compiled: Compiled, names: () => readonly string[]) => {
  let steps = headers.get(compiled);
  if (steps !== undefined) return steps;
  const found: Step[] = [];
  for (const name of names()) {
    found.push(name);
    const event = compiled.events.get(name);
    if (event !== undefined) found.push(event);
  }
  steps = found;
  headers.set(compiled, steps);
  return steps;
};

// The steps of the rows of a collection.
const stepsOf = (collection: CompiledCollection, created: readonly Row[], steps: Step[]) => {
  const names = Object.keys(collection.fields);
  for (const row of created)
    for (const name of names) {
      steps.push(rowAddress(row, name));
      const event = eventOf(row, name);
      if (event !== undefined) steps.push(event);
    }
};

// A form without collections names every field by its name.
const noRows = (): never => {
  throw new Error("A form without collections has no rows");
};

// The position of a field of the header or of a row, and that of an event,
// right after its field; one per form.
const placements = new WeakMap<Compiled, Placement>();
export const placementOf = (compiled: Compiled): Placement => {
  let placement = placements.get(compiled);
  if (placement !== undefined) return placement;
  const field = (address: Field) =>
    typeof address === "string" ? (compiled.positions.get(address) as number) : address.position;
  placement = {
    position: (step) => (isEvent(step) ? field(step.address) + 1 : field(step)),
    eventOf: (address) =>
      typeof address === "string"
        ? compiled.events.get(address)
        : eventOf(address.row, address.field),
  };
  placements.set(compiled, placement);
  return placement;
};

export const programOf = (compiled: Compiled, candidate: Candidate): Program => {
  const { values } = candidate;
  const { formulas } = compiled;
  if (compiled.collections.size === 0)
    return {
      steps: () => headerSteps(compiled, () => Object.keys(values)),
      values,
      formulas,
      rowFormula: noRows,
      get: noRows,
      set: noRows,
      holds: noRows,
    };
  let steps: Step[] | undefined;
  return {
    steps: () => {
      if (steps !== undefined) return steps;
      steps = [...headerSteps(compiled, () => Object.keys(compiled.fields))];
      for (const collection of compiled.collections.values())
        stepsOf(collection, candidate.collections.get(collection.name)?.created ?? [], steps);
      return steps;
    },
    values,
    formulas,
    rowFormula: (address) => formulaOf(address.row, address.field),
    get: (address) => treeValue(values, candidate.collections, address),
    set: (address, value) => {
      writeAt(candidate, address, value);
    },
    holds: (row) => holds(candidate.collections, row),
  };
};
