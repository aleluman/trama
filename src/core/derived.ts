// The states a session publishes, derived from those its contributions
// combine: each field adds its validation and whether its value differs from
// the baseline. An operation derives again only the fields whose value or
// combined state changed, and the fields of the rows it added; the others
// keep their objects. Deriving is pure: an operation that fails after it
// leaves nothing behind.
import type { Address, Field, Row } from "./address.js";
import {
  headerMarks,
  holdsExternal,
  noMarks,
  retired,
  rowMarks,
  withoutRows,
  type Marks,
} from "./marks.js";
import type { Compiled } from "./compiled.js";
import type { Deriver } from "./derived-fields.js";
import {
  all,
  deriveNames,
  deriveScope,
  validatesAlike,
  validatesNothing,
  type Written,
} from "./derived-scope.js";
import type { Published } from "./publication.js";
import { editRowMap, noRowMap, type RowMap } from "./row-maps.js";
import type { States } from "./states.js";
import { recordIn, type Records, type Rows, type Store } from "./tree.js";
import { fieldStatesOf } from "./row-arrays.js";

// The states a session publishes, the baseline their dirty compares with and
// the marks they derive from.
export type Derived = {
  readonly fieldStates: Readonly<Record<string, unknown>>;
  readonly derivedHeader: States;
  readonly derivedRows: RowMap<States>;
  readonly baseline: Store;
  readonly marks: Marks;
};
// What an operation that changes marks gives: the marks in force, and the
// fields it derives again as written. The scopes above the fields find what
// changed of theirs comparing the marks (see countScopes).
export type Marking = { readonly marks: Marks; readonly addresses: ReadonlySet<Field> };
// What an operation derives from: the store and the baseline it compares
// with, the combined states now and before, what it published before, the
// addresses whose value changed, and the rows whose combined states changed
// and those it removed, which opening and restore do not say. Restore compares
// each value with the one published before; the baseline it compares with must
// be the same. Unchecked says that the combined states changed only in what no
// message reads. The marks are those it derives with (see marksOf), and the
// addresses whose mark changed are among those changed. A field keeps the
// state it published only while it was derived with the same mark (see
// deriveField), so restore, which clears the marks, visits the fields and rows
// marked before.
export type Derivation = {
  readonly store: Store;
  readonly baseline: Store;
  readonly raw: Published;
  readonly previous: (Published & Derived & { readonly store: Store }) | undefined;
  readonly changed: ReadonlySet<Address> | undefined;
  readonly rows: Recombined | undefined;
  readonly unchecked: boolean;
  readonly marks: Marks;
};
export type Recombined = {
  readonly recombined: ReadonlySet<Row> | undefined;
  readonly removed: readonly Row[];
};
const noRecords: Records = { published: [], at: new Map() };

const none: readonly never[] = [];
export const deriveStates = (compiled: Compiled, deriver: Deriver, derivation: Derivation) => {
  const derivedHeader = deriveHeader(compiled, deriver, derivation);
  const { rows, changedRows, counted } = deriveRows(deriver, derivation);
  const fieldStates =
    compiled.collections.size === 0
      ? derivedHeader
      : fieldStatesOf(derivation.store, derivation.previous, derivedHeader, rows, changedRows);
  return { fieldStates, derivedHeader, derivedRows: rows, counted };
};
// The marks an operation derives with: those its marking gives; none at
// opening and restore; or else those before, without the rows it removed and
// without the externals of the addresses whose value it changed.
export const marksOf = (
  previous: Marks | undefined,
  marking: Marking | undefined,
  changed: ReadonlySet<Address> | undefined,
  removed: readonly Row[],
): Marks => {
  if (marking !== undefined) return marking.marks;
  if (changed === undefined) return noMarks;
  return retired(withoutRows(previous ?? noMarks, removed), changed);
};

// The header: every field when nothing is known; while its combined states
// are the same, only those whose value changed, which restore finds comparing
// each value with the one published before.
const deriveHeader = (compiled: Compiled, deriver: Deriver, derivation: Derivation) => {
  const { store, baseline, raw, previous, changed } = derivation;
  const before = previous?.derivedHeader;
  const marks = headerMarks(derivation.marks);
  const external = externalIn(derivation.marks, marks);
  if (before !== undefined && raw.headerStates === previous?.headerStates) {
    // Restore also visits the fields marked before, whose marks it clears.
    const marked = previous.marks.header;
    const written =
      changed === undefined
        ? Object.keys(before).filter(
            (name) =>
              !Object.is(store.values[name], previous.store.values[name]) || marked.has(name),
          )
        : (headerWritten(changed) ?? none);
    const { fields } = compiled;
    const { headerStates } = raw;
    return deriveNames(
      deriver,
      fields,
      written,
      store.values,
      baseline.values,
      headerStates,
      before,
      marks,
      external,
    );
  }
  return deriveScope(deriver, compiled.fields, raw.headerStates, {
    before,
    rawBefore: previous?.headerStates,
    values: store.values,
    base: baseline.values,
    written: changed === undefined ? (previous?.store.values ?? all) : headerWritten(changed),
    marks,
    external,
  });
};
const headerWritten = (changed: ReadonlySet<Address>) => {
  let names: Set<string> | undefined;
  for (const address of changed)
    if (typeof address === "string") (names ??= new Set()).add(address);
  return names;
};

// The rows whose fields changed value, whose combined states changed, or that
// the operation added; those of removed rows leave. The rows whose states
// changed, and those whose counts may have: all of them, or, when no message
// changed, those written or added.
const deriveRows = (deriver: Deriver, derivation: Derivation) => {
  const { store, baseline, previous, changed, unchecked } = derivation;
  const changedRows = new Set<Row>();
  const counted = unchecked ? new Set<Row>() : changedRows;
  if (store.collections.size === 0) return { rows: noRowMap<States>(), changedRows, counted };
  const before = previous?.derivedRows;
  const buffer: States[string][] = [];
  const next = editRowMap(before ?? noRowMap<States>());
  let name: string | undefined;
  let rows: Rows | undefined;
  let reference: Rows | undefined;
  for (const [row, fields] of affectedRows(derivation)) {
    if (row.collection.name !== name) {
      name = row.collection.name;
      rows = store.collections.get(name);
      reference = baseline.collections.get(name);
    }
    const record = recordIn((rows as Rows).records, row.key);
    if (record === undefined) continue;
    const kept = before?.get(row.key);
    // Only a field whose value changed, or one of a new row, compares with the baseline.
    const base =
      (fields !== undefined || changed === undefined || kept === undefined) &&
      reference?.rows.has(row.key) === true
        ? recordIn(reference.records, row.key)
        : undefined;
    const states = deriveRow(deriver, derivation, row, fields, { kept, record, base, buffer });
    if (states === kept) continue;
    next.set(row.key, states);
    changedRows.add(row);
    if (unchecked && (fields !== undefined || kept === undefined)) counted.add(row);
  }
  for (const key of removedKeys(derivation, before)) next.delete(key);
  return { rows: next.done(), changedRows, counted };
};
// The keys of the rows removed that published states: those the operation
// says, or, at restore, those whose combined states left, also when as many
// rows came back.
const removedKeys = ({ raw, rows }: Derivation, before: RowMap<States> | undefined) => {
  if (before === undefined) return none;
  if (rows !== undefined) return rows.removed.map((row) => row.key);
  return [...before.keys()].filter((key) => !raw.rowStates.has(key));
};

// One row: only the fields written while its combined states did not change,
// or every field.
type RowInput = {
  readonly kept: States | undefined;
  readonly record: Readonly<Record<string, unknown>>;
  readonly base: Readonly<Record<string, unknown>> | undefined;
  readonly buffer: States[string][];
};
const deriveRow = (
  deriver: Deriver,
  derivation: Derivation,
  row: Row,
  fields: readonly string[] | undefined,
  { kept, record, base, buffer }: RowInput,
) => {
  const { raw, previous, changed, unchecked } = derivation;
  const combined = raw.rowStates.get(row.key) as States;
  const rawBefore = previous?.rowStates.get(row.key);
  const { fields: definitions } = row.collection;
  const marks = rowMarks(derivation.marks, row);
  const external = externalIn(derivation.marks, marks);
  if (kept !== undefined && changed !== undefined && combined === rawBefore)
    return deriveNames(
      deriver,
      definitions,
      fields ?? none,
      record,
      base,
      combined,
      kept,
      marks,
      external,
    );
  // A row that published its combined states, with no field written nor
  // marked, publishes the new ones while they validate alike, as a lock does.
  // A marked field can publish its combined state too, as an external warning
  // that a local one repeats.
  if (
    kept !== undefined &&
    kept === rawBefore &&
    marks === undefined &&
    changed !== undefined &&
    fields === undefined &&
    (unchecked || validatesAlike(definitions, kept, combined))
  )
    return combined;
  // A row first derived against its own record, as at opening, is clean, and
  // valid while no field validates.
  if (kept === undefined && base === record && validatesNothing(combined)) return combined;
  const written: Written =
    changed === undefined ? (heldRecord(derivation, row) ?? all) : fields && new Set(fields);
  const scope = { before: kept, rawBefore, values: record, base, written, marks, external };
  return deriveScope(deriver, definitions, combined, scope, buffer);
};

// Whether the marks of a scope hold externals: looked up only while the
// session has some.
const externalIn = (session: Marks, marks: Parameters<typeof holdsExternal>[0]) =>
  session.externals > 0 && holdsExternal(marks);

// The record a row published before.
const heldRecord = ({ previous }: Derivation, row: Row) =>
  recordIn(previous?.store.collections.get(row.collection.name)?.records ?? noRecords, row.key);
// The rows to derive: those written, those whose combined states changed and,
// when the operation does not say which, each row whose states or record
// changed, and those marked before, whose marks restore clears.
const affectedRows = (derivation: Derivation) => {
  const { store, raw, previous, changed, rows } = derivation;
  const affected = new Map<Row, string[] | undefined>();
  if (changed === undefined)
    for (const row of previous?.marks.rows.keys() ?? none) affected.set(row, undefined);
  for (const address of changed ?? none)
    if (typeof address !== "string" && address.kind === "row") {
      const fields = affected.get(address.row);
      if (fields === undefined) affected.set(address.row, [address.field]);
      else fields.push(address.field);
    }
  const before = previous?.derivedRows;
  const recombined = rows?.recombined;
  if (before !== undefined && changed !== undefined && recombined !== undefined) {
    for (const row of recombined) if (!affected.has(row)) affected.set(row, undefined);
    return affected;
  }
  for (const { created, records } of store.collections.values())
    for (const row of created)
      if (
        !affected.has(row) &&
        (before === undefined ||
          raw.rowStates.get(row.key) !== previous?.rowStates.get(row.key) ||
          (changed === undefined && heldRecord(derivation, row) !== recordIn(records, row.key)))
      )
        affected.set(row, undefined);
  return affected;
};
