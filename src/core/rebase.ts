// What dirty compares again when a commit changes the baseline: the fields of
// the header and of live rows whose baseline value changed, the rows that join
// or leave the baseline and the collections whose baseline order changed. Each
// row compares its records by identity first, so the cost is the rows plus
// what changed, and the first edit after a commit pays nothing.
import { rowAddress, type Address, type Row } from "./address.js";
import type { Compiled } from "./compiled.js";
import { fieldNames } from "./derived-scope.js";
import { recordIn, type Store } from "./tree.js";

// The addresses whose baseline value changed, and the rows that joined or left
// the baseline.
export type Rebased = {
  readonly addresses: ReadonlySet<Address>;
  readonly rows: ReadonlySet<Row>;
};
export const rebaseOf = (compiled: Compiled, before: Store, after: Store, live: Store): Rebased => {
  const addresses = new Set<Address>();
  const rows = new Set<Row>();
  for (const name of fieldNames(compiled.fields))
    if (!Object.is(before.values[name], after.values[name])) addresses.add(name);
  for (const [name, collection] of compiled.collections) {
    const was = before.collections.get(name);
    const is = after.collections.get(name);
    if (was === undefined || is === undefined || was.records === is.records) continue;
    if (was.order !== is.order) addresses.add(collection.structure);
    for (const row of live.collections.get(name)?.created ?? []) {
      const old = recordIn(was.records, row.key);
      const saved = recordIn(is.records, row.key);
      if (old === saved) continue;
      if (old === undefined || saved === undefined) rows.add(row);
      for (const field of fieldNames(collection.fields))
        if (old === undefined || saved === undefined || !Object.is(old[field], saved[field]))
          addresses.add(rowAddress(row, field));
    }
  }
  return { addresses, rows };
};

// What dirty compares again when a change derives against another baseline
// than the states before, as after a commit; nothing at opening and restore.
export const rebasing = (
  compiled: Compiled,
  {
    store,
    baseline,
    previous,
    changed,
  }: {
    readonly store: Store;
    readonly baseline: Store;
    readonly previous: { readonly baseline: Store } | undefined;
    readonly changed: ReadonlySet<Address> | undefined;
  },
) =>
  previous === undefined || changed === undefined || previous.baseline === baseline
    ? undefined
    : rebaseOf(compiled, previous.baseline, baseline, store);
