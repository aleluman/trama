// The marks of the fields of a session: whether the person touched each one,
// the messages of the views that could not convert their text into a value,
// and what the sources of the application give it from outside its rules.
// They are part of the states a session publishes, as dirty: deriving a field
// reads its mark. Only touch, the input of a view and the sources change
// them; a reset clears them, the rows removed take theirs, and a destination
// whose value changes loses its externals. They are kept by scope, as
// deriving reads them: those of the header by name, and those of each row by
// row and name, so a row without marks costs nothing. The externals of a row,
// a collection or the form, which are no field, are kept apart.
import {
  isField,
  type Address,
  type Destination,
  type Field,
  type Own,
  type Row,
} from "./address.js";
import { noMessages, withSource, type Channel, type External } from "./external.js";
export { keptItems, merged } from "./external.js";
export type { Channel, External } from "./external.js";

export type Mark = {
  readonly touched: boolean;
  readonly inputs: readonly string[];
  readonly external?: External | undefined;
};
export type ScopeMarks = ReadonlyMap<string, Mark>;
// The marks of the header and of each row, how many addresses have inputs,
// the externals of the scopes above the fields, and how many destinations
// have externals.
export type Marks = {
  readonly header: ScopeMarks;
  readonly rows: ReadonlyMap<Row, ScopeMarks>;
  readonly inputs: number;
  readonly own: ReadonlyMap<Own, External>;
  readonly externals: number;
};
const noScope: ScopeMarks = new Map();
export const noMarks: Marks = Object.freeze({
  header: noScope,
  rows: new Map(),
  inputs: 0,
  own: new Map(),
  externals: 0,
});
export const noInputs: readonly string[] = Object.freeze([]);
export const untouched: Mark = Object.freeze({ touched: false, inputs: noInputs });

export const markAt = (marks: Marks, address: Field) =>
  typeof address === "string"
    ? marks.header.get(address)
    : marks.rows.get(address.row)?.get(address.field);
const empty = (mark: Mark) =>
  !mark.touched && mark.inputs.length === 0 && mark.external === undefined;

// The marks with that of one address replaced; an empty mark leaves. Only the
// scope of the address is copied, and the map of the rows when it is a cell.
export const withMark = (marks: Marks, address: Field, mark: Mark): Marks => {
  const inputs = marks.inputs - Number(hasInputs(markAt(marks, address))) + Number(hasInputs(mark));
  if (typeof address === "string")
    return { ...marks, header: replaced(marks.header, address, mark), inputs };
  const rows = new Map(marks.rows);
  const scope = replaced(marks.rows.get(address.row) ?? noScope, address.field, mark);
  if (scope.size === 0) rows.delete(address.row);
  else rows.set(address.row, scope);
  return { ...marks, rows, inputs };
};
const replaced = (scope: ScopeMarks, name: string, mark: Mark) => {
  const next = new Map(scope);
  if (empty(mark)) next.delete(name);
  else next.set(name, mark);
  return next;
};
const hasInputs = (mark: Mark | undefined) => mark !== undefined && mark.inputs.length > 0;

// The marks without those of the rows removed.
export const withoutRows = (marks: Marks, removed: readonly Row[]): Marks => {
  if ((marks.rows.size === 0 && marks.own.size === 0) || removed.length === 0) return marks;
  let rows: Map<Row, ScopeMarks> | undefined;
  let own: Map<Own, External> | undefined;
  let { inputs, externals } = marks;
  for (const row of removed) {
    if (marks.own.has(row)) {
      (own ??= new Map(marks.own)).delete(row);
      externals -= 1;
    }
    const scope = marks.rows.get(row);
    if (scope === undefined) continue;
    (rows ??= new Map(marks.rows)).delete(row);
    for (const mark of scope.values()) {
      inputs -= Number(hasInputs(mark));
      externals -= Number(mark.external !== undefined);
    }
  }
  if (rows === undefined && own === undefined) return marks;
  return {
    header: marks.header,
    rows: rows ?? marks.rows,
    inputs,
    own: own ?? marks.own,
    externals,
  };
};

// An edition of the externals of some destinations: each scope it writes is
// copied once, and done gives the marks themselves when nothing changed.
const editExternals = (marks: Marks) => {
  let header: Map<string, Mark> | undefined;
  let rows: Map<Row, ScopeMarks> | undefined;
  let own: Map<Own, External> | undefined;
  const scopes = new Map<Row, Map<string, Mark>>();
  let { externals } = marks;
  const get = (destination: Destination) =>
    externalAt(header ?? marks.header, rows ?? marks.rows, own ?? marks.own, destination);
  const writable = (address: Field) => {
    if (typeof address === "string") return (header ??= new Map(marks.header));
    let scope = scopes.get(address.row);
    if (scope === undefined) {
      scope = new Map(marks.rows.get(address.row));
      scopes.set(address.row, scope);
      (rows ??= new Map(marks.rows)).set(address.row, scope);
    }
    return scope;
  };
  const set = (destination: Destination, external: External | undefined) => {
    const before = get(destination);
    if (before === external) return false;
    externals += Number(external !== undefined) - Number(before !== undefined);
    if (!isField(destination)) {
      own ??= new Map(marks.own);
      if (external === undefined) own.delete(destination);
      else own.set(destination, external);
      return true;
    }
    const name = typeof destination === "string" ? destination : destination.field;
    const scope = writable(destination);
    const mark = { ...(scope.get(name) ?? untouched), external };
    if (empty(mark)) scope.delete(name);
    else scope.set(name, mark);
    return true;
  };
  const done = (): Marks => {
    if (header === undefined && rows === undefined && own === undefined) return marks;
    for (const [row, scope] of scopes) if (scope.size === 0) rows?.delete(row);
    return {
      header: header ?? marks.header,
      rows: rows ?? marks.rows,
      inputs: marks.inputs,
      own: own ?? marks.own,
      externals,
    };
  };
  return { get, set, done };
};

const externalAt = (
  header: ScopeMarks,
  rows: Marks["rows"],
  own: Marks["own"],
  destination: Destination,
) => {
  if (!isField(destination)) return own.get(destination);
  return typeof destination === "string"
    ? header.get(destination)?.external
    : rows.get(destination.row)?.get(destination.field)?.external;
};

// The marks with one channel of a source replaced: what it gives each
// destination now, and nothing where it gave something before. With them, the
// fields whose external changed, which derive again; undefined when nothing
// changed.
export const sourced = (
  marks: Marks,
  source: number,
  channel: Channel,
  lists: ReadonlyMap<Destination, readonly string[]>,
  before: Iterable<Destination>,
) => {
  const edit = editExternals(marks);
  const addresses = new Set<Field>();
  const replace = (destination: Destination, list: readonly string[]) => {
    const changed = edit.set(destination, withSource(edit.get(destination), source, channel, list));
    if (changed && isField(destination)) addresses.add(destination);
  };
  for (const destination of before) if (!lists.has(destination)) replace(destination, noMessages);
  for (const [destination, list] of lists) replace(destination, list);
  const next = edit.done();
  return next === marks ? undefined : { marks: next, addresses };
};

// The marks without the externals of what an operation changed: those of each
// field whose value changed, with the own ones of the row of a cell, and those
// of a collection whose rows changed. It looks before it copies anything, so
// an edit far from every external costs a lookup per address.
export const retired = (marks: Marks, changed: ReadonlySet<Address>) => {
  if (marks.externals === 0 || changed.size === 0) return marks;
  let edit: ReturnType<typeof editExternals> | undefined;
  const retire = (destination: Destination) => {
    const external =
      edit === undefined
        ? externalAt(marks.header, marks.rows, marks.own, destination)
        : edit.get(destination);
    if (external !== undefined) (edit ??= editExternals(marks)).set(destination, undefined);
  };
  for (const address of changed) {
    retire(address);
    if (typeof address !== "string" && address.kind === "row") retire(address.row);
  }
  return edit === undefined ? marks : edit.done();
};

// The marks of a scope, or undefined while it has none, so deriving pays
// nothing for it.
export const headerMarks = (marks: Marks) => (marks.header.size === 0 ? undefined : marks.header);
export const rowMarks = (marks: Marks, row: Row) => marks.rows.get(row);
// Whether some mark of a scope holds externals.
export const holdsExternal = (marks: ScopeMarks | undefined) => {
  if (marks === undefined) return false;
  for (const mark of marks.values()) if (mark.external !== undefined) return true;
  return false;
};
// The inputs of a mark, the same empty list when it has none.
export const inputsOf = (mark: Mark | undefined) =>
  mark === undefined || mark.inputs.length === 0 ? noInputs : mark.inputs;
