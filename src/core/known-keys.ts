// The keys a session gave the rows of each collection, kept as ranges of
// their sequences: a key of a row that left is told from one that was never
// its own, without keeping the rows. The rows of an opening are one range.
import type { Row } from "./address.js";

// Per collection, the first and the last sequence of each range, in pairs.
export type KnownKeys = Map<string, number[]>;

export const remember = (known: KnownKeys, rows: Iterable<Row>) => {
  for (const { collection, seq } of rows) {
    let ranges = known.get(collection.name);
    if (ranges === undefined) known.set(collection.name, (ranges = []));
    if (ranges.at(-1) === seq - 1) ranges[ranges.length - 1] = seq;
    else ranges.push(seq, seq);
  }
};

// Whether the session gave the key to a row of the collection.
export const knows = (known: KnownKeys, collection: string, key: unknown) => {
  if (typeof key !== "string" || !/^r[1-9]\d*$/u.test(key)) return false;
  const seq = Number(key.slice(1));
  const ranges = known.get(collection) ?? [];
  for (let at = 0; at < ranges.length; at += 2)
    if (seq >= (ranges[at] as number) && seq <= (ranges[at + 1] as number)) return true;
  return false;
};
