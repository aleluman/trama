// What the engine of a session offers, and what each operation publishes.
import type { Destination, Field, Row, RowKey } from "./address.js";
import type { CompiledCollection } from "./collections.js";
import type { NewRow } from "./commands.js";
import type { FormDefinition, FormValues } from "./definition.js";
export type { FormDefinition } from "./definition.js";
import type { Params, Placing, PreparedRecord, Receipt } from "./memory.js";
export type { Receipt } from "./memory.js";
import type { OutputEvaluations } from "./outputs.js";
import type { FieldStates, States } from "./states.js";
import type { RowMap } from "./row-maps.js";
import type { FormState, ScopeState } from "./scope-states.js";
import type { Store } from "./tree.js";

// What the session publishes after each operation, with its receipt, and what
// it keeps to answer its handles: the rows of each collection and the states
// of each row.
export type Publication<D extends FormDefinition> = {
  readonly values: Readonly<FormValues<D>>;
  readonly fieldStates: FieldStates<D>;
  readonly rows: Readonly<Record<string, readonly RowKey[]>>;
  readonly outputs: OutputEvaluations;
  readonly params: Params;
  readonly queryParams: Params;
  readonly store: Store;
  readonly rowStates: RowMap<States>;
  readonly form: FormState;
  readonly rowScopes: RowMap<ScopeState>;
  readonly receipt: Receipt;
};
// Every operation takes checked arguments; edit checks its own.
export type Engine<D extends FormDefinition> = {
  edit(name: PropertyKey, value: unknown): Publication<D>;
  restore(): Publication<D>;
  // A patch of the session or of a handle: a command, which edits every
  // field it writes and keeps its direct edits for onEdit.
  patch(writes: ReadonlyMap<Field, unknown>): Publication<D>;
  // The patch of the responses of queries, which edits no field directly.
  // before is the store events read as before when a failed batch applies
  // response by response: the start of the batch.
  respond(writes: ReadonlyMap<Field, unknown>, before?: Store): Publication<D>;
  add(
    collection: CompiledCollection,
    rows: readonly NewRow[],
    at: number,
  ): { readonly publication: Publication<D>; readonly keys: readonly RowKey[] };
  remove(collection: CompiledCollection, rows: readonly Row[]): Publication<D>;
  move(collection: CompiledCollection, row: Row, to: number): Publication<D>;
  // The record of a prepared of the state in force, given the fields whose
  // query had not arrived.
  capture(unsettled: ReadonlySet<Field>): PreparedRecord;
  // Accepts a prepared with canonical values, as session.patch writes them:
  // undefined when it is older than a reset or than the last one accepted.
  accept(prepared: unknown, canonical: unknown): Publication<D> | undefined;
  // Mark an address touched, or replace the inputs of its views, deriving it
  // again without changing a value: undefined when its mark would not change.
  touch(address: Field): Publication<D> | undefined;
  input(address: Field, inputs: readonly string[]): Publication<D> | undefined;
  // Replaces what a source gives in one channel: the list of each destination
  // now, and nothing where it gave something before. Undefined when nothing
  // would change.
  external(
    source: number,
    channel: "errors" | "warnings",
    lists: ReadonlyMap<Destination, readonly string[]>,
    before: Iterable<Destination>,
  ): Publication<D> | undefined;
  // Where the messages of a response to a prepared of this engine may go:
  // undefined when it is too old. It throws for one of another session.
  placing(prepared: unknown, command: string): Placing | undefined;
};
