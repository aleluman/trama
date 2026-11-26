import { useCallback, useSyncExternalStore } from "react";
import type { CollectionName, FormDefinition, RowKey, Session } from "../core/index.js";

// The keys of the rows of a collection, in visual order. The array keeps its
// identity while the rows of the collection and their order do not change, so
// a table that renders them does not render again on every key stroke.
export const useRows = <D extends FormDefinition, N extends CollectionName<D>>(
  session: Session<D>,
  collection: N,
): readonly RowKey<N>[] => {
  const select = useCallback(() => {
    const keys = session.getSnapshot().rows[collection];
    if (keys === undefined) throw new Error(`Unknown collection "${collection}"`);
    return keys;
  }, [session, collection]);
  return useSyncExternalStore(session.subscribe, select);
};
