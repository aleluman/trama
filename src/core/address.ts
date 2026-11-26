// The address of a field: the only owner of how the engine names a value. A
// field of the header is named by its name, as before collections existed; a
// field of a row, by an interned address of its row; and the membership and
// order of a collection, by its structure.
import type { CompiledCollection } from "./collections.js";
import type { EndpointTable } from "./compiled.js";
import type { FieldDefinition } from "./fields.js";

declare const rowKey: unique symbol;
// The opaque identity a session gives a row of collection N. It is neither its
// position nor a persisted id, and it is never reused.
export type RowKey<N extends string = string> = string & { readonly [rowKey]: N };

// Two copies of the package in the same global share the counter, so a key
// never names a row of another session. Keys are unique per realm, not across
// iframes or workers.
const counter = Symbol.for("trama.rowKeys.1");
type Counter = { next: number };
const keys = ((globalThis as { [counter]?: Counter })[counter] ??= { next: 0 }) as Counter;
// The number of keys given so far in the realm, which bounds every sequence.
export const keysGiven = () => keys.next;

// A row of a collection, as long as it exists: its key; its sequence, the
// number of its key, which orders the rows of a collection by creation; and
// the addresses of its fields and the instances of its rules, each created
// once, when first needed.
export type Row = {
  readonly key: RowKey;
  readonly seq: number;
  readonly collection: CompiledCollection;
  readonly addresses: Map<string, RowAddress>;
  readonly instances: Map<object, object>;
};
// A field of a row, with its position in the traversal.
export type RowAddress = {
  readonly kind: "row";
  readonly row: Row;
  readonly field: string;
  readonly position: number;
};
// The membership and order of a collection: its value is the array of keys,
// compared by identity.
export type StructureAddress = {
  readonly kind: "structure";
  readonly collection: CompiledCollection;
};
export type Address = string | RowAddress | StructureAddress;
// A field of the header or of a row: what a value is written to.
export type Field = string | RowAddress;
// What a message from outside the rules is given to: a field, or a scope
// above the fields, which is a row, a collection, named by the address of its
// structure, or the form.
export const formScope = Object.freeze({ kind: "form" });
export type Own = Row | StructureAddress | typeof formScope;
export type Destination = Field | Own;
export const isField = (destination: Destination): destination is Field =>
  typeof destination === "string" || ("kind" in destination && destination.kind === "row");
export const isRow = (destination: Destination): destination is Row =>
  typeof destination !== "string" && !("kind" in destination);

export const createRow = (collection: CompiledCollection): Row => {
  const seq = ++keys.next;
  return { key: `r${seq}` as RowKey, seq, collection, addresses: new Map(), instances: new Map() };
};

export const rowAddress = (row: Row, field: string): RowAddress => {
  let address = row.addresses.get(field);
  if (address === undefined) {
    const position = rowPosition(row, field);
    address = Object.freeze({ kind: "row", row, field, position });
    row.addresses.set(field, address);
  }
  return address;
};

// The traversal of an operation visits the header, field by field in
// declaration order, then each collection in declaration order, its rows in
// creation order and their fields in declaration order; each field is right
// before its event. A position orders that traversal as a number: the field
// at index i of the header is 2i, its event 2i + 1; a field of a row adds the
// span of its collection and the sequence of its row times the width of a row.
// Positions stay exact while every sequence times every width is below the
// span, which an operation checks before it relies on them.
export const span = 2 ** 44;
const rowPosition = (row: Row, field: string) =>
  (row.collection.index + 1) * span +
  row.seq * row.collection.width +
  (row.collection.positions.get(field) as number);

// The definition of a field and the endpoint of an async field: of the header,
// or of the rows of its collection.
export const definitionAt = (
  fields: Readonly<Record<string, FieldDefinition>>,
  address: Field,
): FieldDefinition =>
  (typeof address === "string"
    ? fields[address]
    : address.row.collection.fields[address.field]) as FieldDefinition;
export const endpointAt = (endpoints: EndpointTable, address: Field) =>
  typeof address === "string"
    ? endpoints.get(address)
    : address.row.collection.endpoints.get(address.field);

// The instance of a template for a row, created once.
export const instanceOf = <T extends object>(row: Row, template: object, create: () => T): T => {
  let instance = row.instances.get(template) as T | undefined;
  if (instance === undefined) {
    instance = create();
    row.instances.set(template, instance);
  }
  return instance;
};

// How diagnostics name a field: by its name in the header, and with its
// collection and the key of its row otherwise, never by its position.
export const fieldLabel = (name: string, row?: Row) =>
  row === undefined
    ? `Field "${name}"`
    : `${templateLabel(name, row.collection.name)} row "${row.key}"`;
export const labelAt = (address: Field) =>
  typeof address === "string" ? fieldLabel(address) : fieldLabel(address.field, address.row);
// A field of a collection, as its declaration and the templates of its rules
// name it: an instance adds the key of its row.
export const templateLabel = (name: string, collection: string) =>
  `Field "${name}" of "${collection}"`;
// How the path of a cycle names a field.
export const pathLabel = (address: string | RowAddress) =>
  typeof address === "string"
    ? address
    : `${address.row.collection.name}["${address.row.key}"].${address.field}`;
