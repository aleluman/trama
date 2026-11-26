// The maps by row key that a session publishes for every row, which an
// operation copies only in part: the entries live in chunks by a hash of the
// key, and a new version shares every chunk it does not write. Changing one
// row of 10,000 copies one chunk and the list of chunks, not every entry.
import type { RowKey } from "./address.js";

const chunkCount = 64;
type Chunks<V> = readonly (ReadonlyMap<RowKey, V> | undefined)[];
export type RowMap<V> = {
  readonly chunks: Chunks<V>;
  readonly size: number;
  readonly get: (key: RowKey) => V | undefined;
  readonly has: (key: RowKey) => boolean;
  readonly keys: () => Generator<RowKey>;
};

const chunkOf = (key: string) => {
  let hash = 0;
  for (let index = 0; index < key.length; index++)
    hash = Math.imul(hash, 31) + (key.codePointAt(index) as number);
  return hash & (chunkCount - 1);
};
const versionOf = <V>(chunks: Chunks<V>, size: number): RowMap<V> =>
  Object.freeze({
    chunks,
    size,
    get: (key: RowKey) => chunks[chunkOf(key)]?.get(key),
    has: (key: RowKey) => chunks[chunkOf(key)]?.has(key) === true,
    *keys() {
      for (const chunk of chunks) if (chunk !== undefined) yield* chunk.keys();
    },
  });
const empty: RowMap<never> = versionOf([], 0);
export const noRowMap = <V>(): RowMap<V> => empty;

// A new version of a map: each chunk it writes is copied once, and done
// returns the map itself when nothing was written.
export const editRowMap = <V>(map: RowMap<V>) => {
  let chunks: (Map<RowKey, V> | undefined)[] | undefined;
  let copied: boolean[] | undefined;
  let { size } = map;
  const writable = (index: number) => {
    chunks ??= Array.from({ length: chunkCount }, (_, at) => map.chunks[at] as Map<RowKey, V>);
    copied ??= [];
    if (copied[index] !== true) {
      chunks[index] = new Map(chunks[index]);
      copied[index] = true;
    }
    return chunks[index] as Map<RowKey, V>;
  };
  return {
    set: (key: RowKey, value: V) => {
      const chunk = writable(chunkOf(key));
      if (!chunk.has(key)) size++;
      chunk.set(key, value);
    },
    delete: (key: RowKey) => {
      const index = chunkOf(key);
      if ((chunks?.[index] ?? map.chunks[index])?.has(key) !== true) return;
      writable(index).delete(key);
      size--;
    },
    done: (): RowMap<V> => (chunks === undefined ? map : versionOf(chunks, size)),
  };
};
