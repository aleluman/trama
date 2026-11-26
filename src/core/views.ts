// The read-only views a rule or an output reads values through. Each field read
// goes through read and, in a view that tracks, is recorded with the value it
// returned; names that are not fields read as in a plain object and are not
// recorded. Reading a collection reads its structure, so that every question
// about its rows depends on it, also about a row it does not have; it is a
// lazy array of rows, and each field of a row is read on its own.
// Once the run ends, the views stop recording and read their source directly.
import { arrayIndex } from "./data.js";
import { rowAddress, type Address, type Field, type Row, type RowKey } from "./address.js";
import type { CompiledCollection } from "./collections.js";
import type { Read, Reads, RuleValues } from "./reads.js";

// The values of a form with collections, as a candidate holds them or as they
// were published. shape has the header fields and the collections as its own
// keys; get reads a value without resolving it.
export type Tree = {
  readonly shape: object;
  readonly collections: ReadonlyMap<string, CompiledCollection>;
  row(collection: CompiledCollection, key: RowKey): Row | undefined;
  get(address: Address): unknown;
};
// What rules read: the values of a form without collections, or a tree.
export type Source = { readonly values: RuleValues; readonly tree: Tree | undefined };

// The traps of a view that reject every mutation, one set per message.
const rejections = new Map<string, ProxyHandler<RuleValues>>();
const mutations = (message: string) => {
  let traps = rejections.get(message);
  if (traps === undefined) {
    const reject = (): never => {
      throw new TypeError(message);
    };
    traps = {
      set: reject,
      deleteProperty: reject,
      defineProperty: reject,
      setPrototypeOf: reject,
      preventExtensions: reject,
    };
    rejections.set(message, traps);
  }
  return traps;
};

// How a view reads a field: through read while the run lasts, recording it if
// the view tracks; and then from its source.
type Value = (address: Address, tracks: boolean) => unknown;

export type EditValue = { readonly address: Field; readonly value: unknown };

export const viewsOf = (
  source: Source,
  read: Read,
  readonly = "Formula values are readonly",
  edit?: EditValue,
) => {
  const reads = new Map<Address, unknown>();
  let running = true;
  const traps = mutations(readonly);
  const { tree, values } = source;
  const value: Value = (address, tracks) => {
    if (!running) return tree === undefined ? values[address as string] : tree.get(address);
    if (edit !== undefined && edit.address === address) return edit.value;
    const found = read(address);
    if (tracks) reads.set(address, found);
    return found;
  };
  const stop = () => {
    running = false;
  };
  if (tree !== undefined) {
    const { form, row, rows: keys } = treeViews(tree, value, traps);
    return { form, row, rows: keys, reads: reads as Reads, stop };
  }
  // The view of a form without collections is its record itself, which reads
  // as a plain object once the run ends.
  const form = (tracks: boolean): RuleValues =>
    new Proxy(values, {
      ...traps,
      ...(edit === undefined
        ? undefined
        : { getOwnPropertyDescriptor: editDescriptor(edit, () => running) }),
      get(target, key, receiver) {
        if (!running || typeof key !== "string" || !Object.hasOwn(target, key))
          return Reflect.get(target, key, receiver) as unknown;
        return value(key, tracks);
      },
    });
  return {
    form,
    row: (_: Row, tracks: boolean) => form(tracks),
    rows,
    reads: reads as Reads,
    stop,
  };
};

const editDescriptor =
  (edit: EditValue, running: () => boolean) => (target: RuleValues, key: PropertyKey) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    return descriptor !== undefined && running() && edit.address === key
      ? { ...descriptor, value: edit.value }
      : descriptor;
  };

// A view of fields over a shape, which answers its own keys with values.
const fieldsView = (shape: object, traps: object, get: (key: string) => unknown) =>
  new Proxy(shape, {
    ...traps,
    get: (target, key, receiver) =>
      typeof key === "string" && Object.hasOwn(target, key)
        ? get(key)
        : (Reflect.get(target, key, receiver) as unknown),
    getOwnPropertyDescriptor(target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      return descriptor === undefined || typeof key !== "string"
        ? descriptor
        : { ...descriptor, value: get(key) };
    },
  }) as RuleValues;

// The views of a form with collections. Each run keeps one view per row and
// per collection, tracked or not.
const treeViews = (tree: Tree, value: Value, traps: object) => {
  const cache = [new Map<object, RuleValues>(), new Map<object, RuleValues>()] as const;
  const once = (owner: object, tracks: boolean, create: () => RuleValues) => {
    const views = cache[tracks ? 0 : 1];
    let view = views.get(owner);
    if (view === undefined) {
      view = create();
      views.set(owner, view);
    }
    return view;
  };
  const row = (found: Row, tracks: boolean) =>
    once(found, tracks, () =>
      fieldsView(found.collection.shape, traps, (key) => value(rowAddress(found, key), tracks)),
    );
  const collection = (owner: CompiledCollection, tracks: boolean) =>
    once(owner, tracks, () => {
      // Reading the collection recorded its structure.
      const order = () => value(owner.structure, false) as readonly RowKey[];
      const at = (key: RowKey) => row(tree.row(owner, key) as Row, tracks);
      return rowsView(tree.get(owner.structure) as readonly RowKey[], order, at, traps);
    });
  const form = (tracks: boolean) =>
    once(tree, tracks, () =>
      fieldsView(tree.shape, traps, (key) => {
        const found = tree.collections.get(key);
        if (found === undefined) return value(key, tracks);
        value(found.structure, tracks);
        return collection(found, tracks);
      }),
    );
  // The keys of each collection, which read its structure and no value.
  const keys = () =>
    Object.freeze(
      Object.defineProperties(
        {},
        Object.fromEntries(
          Array.from(tree.collections.values(), (owner) => [
            owner.name,
            { enumerable: true, get: () => value(owner.structure, true) },
          ]),
        ),
      ),
    );
  return { form, row, rows: keys };
};
// A form without collections gives its events no keys.
const noRows = Object.freeze({});
const rows = () => noRows;

// A collection as an array of rows. The target is an array of its own, since a
// frozen one could not answer its indices with views; its length is that of
// the structure when the view is created, which a run does not change.
const rowsView = (
  initial: readonly RowKey[],
  order: () => readonly RowKey[],
  at: (key: RowKey) => RuleValues,
  traps: object,
) => {
  const target: unknown[] = [];
  target.length = initial.length;
  const index = (key: PropertyKey) => {
    const found = typeof key === "string" ? arrayIndex(key) : undefined;
    return found !== undefined && found < target.length ? found : undefined;
  };
  const rowAt = (position: number) => at(order()[position] as RowKey);
  return new Proxy(target, {
    ...traps,
    get(array, key, receiver) {
      if (key === "length") return order().length;
      const found = index(key);
      return found === undefined ? (Reflect.get(array, key, receiver) as unknown) : rowAt(found);
    },
    has(array, key) {
      if (index(key) === undefined) return Reflect.has(array, key);
      order();
      return true;
    },
    ownKeys: () => [...order().map((_, position) => String(position)), "length"],
    getOwnPropertyDescriptor(array, key) {
      const found = index(key);
      return found === undefined
        ? Reflect.getOwnPropertyDescriptor(array, key)
        : { value: rowAt(found), writable: true, enumerable: true, configurable: true };
    },
  }) as unknown as RuleValues;
};
