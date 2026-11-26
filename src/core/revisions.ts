// The revisions of the values of a session while a prepared may be accepted:
// each operation that changes values takes the next number, and each address
// it changed keeps it, with whether its last writer was explicit, a command,
// a response or an event, or derived, a formula. A formula that writes again
// the value of an explicit write makes it derived, and it keeps its number.
// A write by onEdit keeps the new number even if the value is unchanged.
// They start with the first prepared, and reset drops them. A removed row
// takes its revisions with it.
// A change of the rows of a collection keeps its number too, by the address of
// its structure. What a commit writes is of the server: it is kept apart, so
// it counts as a change for a response to another prepared and for nothing
// else.
import type { Address, Field, RowAddress, StructureAddress } from "./address.js";
import type { WriterKind } from "./memory.js";

// A revision: the number of the operation, positive when explicit.
type Revision = number;
export type Revisions = {
  // The number of the last operation recorded.
  readonly now: () => number;
  // Records an operation: the addresses it changed, the writers its resolution
  // settled by kind, and whether a field it wrote itself is explicit.
  readonly record: (
    changed: ReadonlySet<Address>,
    writers: ReadonlyMap<Field, WriterKind> | undefined,
    explicit: (address: Field) => boolean,
  ) => void;
  // Whether an operation after since changed the address, even back to its
  // value, or the rows of the collection of a structure.
  readonly changedAfter: (address: Address, since: number) => boolean;
  // Whether its value is an explicit write after since that no formula replaced.
  readonly explicitAfter: (address: Field, since: number) => boolean;
  // Records what a commit changed, apart, and gives its number.
  readonly serve: (changed: ReadonlySet<Address>) => number;
  // Whether a commit after since changed the address, other than that number.
  readonly servedAfter: (address: Address, since: number, own: number) => boolean;
};

// Whether the last writer of a field the operation changed makes it explicit:
// a command, a response or an event do, and a formula does not; without a
// writer of the resolution, the operation wrote it itself.
const isExplicit = (
  writer: WriterKind | undefined,
  explicit: (address: Field) => boolean,
  address: Field,
) => (writer === undefined ? explicit(address) : writer !== "formula");

export const createRevisions = (): Revisions => {
  let last = 0;
  const header = new Map<string, Revision>();
  // Addresses of rows are interned per row, so they leave with it; that of a
  // structure, per collection.
  const interned = new WeakMap<RowAddress | StructureAddress, Revision>();
  const revisionOf = (address: Address) =>
    typeof address === "string" ? header.get(address) : interned.get(address);
  const put = (address: Address, revision: Revision) => {
    if (typeof address === "string") header.set(address, revision);
    else interned.set(address, revision);
  };
  const served = { header: new Map<string, Revision>(), interned: new WeakMap<object, Revision>() };
  const servedOf = (address: Address) =>
    typeof address === "string" ? served.header.get(address) : served.interned.get(address);
  return {
    now: () => last,
    record: (changed, writers, explicit) => {
      last += 1;
      for (const address of changed) {
        if (typeof address !== "string" && address.kind === "structure") {
          interned.set(address, last);
          continue;
        }
        put(address, isExplicit(writers?.get(address), explicit, address) ? last : -last);
      }
      if (writers !== undefined)
        for (const [address, writer] of writers)
          if (writer === "edit") put(address, last);
          else if (writer === "formula") {
            const revision = revisionOf(address) ?? 0;
            if (revision > 0) put(address, -revision);
          }
    },
    changedAfter: (address, since) => Math.abs(revisionOf(address) ?? 0) > since,
    explicitAfter: (address, since) => (revisionOf(address) ?? 0) > since,
    serve: (changed) => {
      last += 1;
      for (const address of changed)
        if (typeof address === "string") served.header.set(address, last);
        else served.interned.set(address, last);
      return last;
    },
    servedAfter: (address, since, own) => {
      const revision = servedOf(address) ?? 0;
      return revision > since && revision !== own;
    },
  };
};
