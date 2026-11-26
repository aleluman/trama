// The prepared of a session: what prepare captured when it was ready, frozen,
// with the values and the rows it published, and the record that only the
// session that captured it can read. The record keeps the state of the engine
// at that moment, with its own memory, which nothing mutates any more.
import type { Issue } from "./issues.js";
import type { PreparedRecord } from "./memory.js";
export type Ready = {
  readonly status: "ready";
  readonly values: Readonly<Record<string, unknown>>;
  readonly rows: Readonly<Record<string, readonly string[]>>;
  readonly warnings: readonly Issue[];
};

// Every prepared of every session, which a fabricated object is not.
const records = new WeakMap<object, PreparedRecord>();

export const preparedOf = (record: PreparedRecord, warnings: readonly Issue[]): Ready => {
  const { store, rows } = record.state;
  const prepared: Ready = Object.freeze({ status: "ready", values: store.values, rows, warnings });
  records.set(prepared, record);
  return prepared;
};

// The record of a prepared of owner; one of another session, or an object
// that no prepare gave, has none.
export const recordOf = (prepared: unknown, owner: object) => {
  const record =
    typeof prepared === "object" && prepared !== null ? records.get(prepared) : undefined;
  return record?.owner === owner ? record : undefined;
};
