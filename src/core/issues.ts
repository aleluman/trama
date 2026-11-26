// The problems of a session, as prepare gives them: each message with where it
// is, in visual order. The form first, then the fields of the header in
// declaration order and, per collection in declaration order, its own
// messages and its rows in their position, each row with its own messages
// before those of its fields. The counts prune the scopes without messages,
// so a form without problems visits nothing.
import { rowAddress, type Field, type Row, type RowKey } from "./address.js";
import type { Compiled } from "./compiled.js";
import { fieldNames } from "./derived-scope.js";
import type { RowMap } from "./row-maps.js";
import type { FormState, ScopeState } from "./scope-states.js";
import type { States } from "./states.js";
import type { Store } from "./tree.js";

// A message and where it is: the form, a field of the header, a collection, a
// row of it or a field of that row.
export type Issue = {
  readonly message: string;
  readonly field?: string | undefined;
  readonly collection?: string | undefined;
  readonly key?: RowKey | undefined;
};
// What the problems are read from: the last publication of a session, with
// the states of the header in fieldStates and those of each row.
type Located = {
  readonly store: Store;
  readonly form: FormState;
  readonly fieldStates: Readonly<Record<string, unknown>>;
  readonly rowStates: RowMap<States>;
  readonly rowScopes: RowMap<ScopeState>;
};
// The fields whose query a submission needed and failed, each with its message.
export type Failed = ReadonlyMap<Field, string>;

const none: readonly Issue[] = Object.freeze([]);
const counts = { errors: "errorCount", warnings: "warningCount" } as const;

export const issuesOf = (
  compiled: Compiled,
  published: Located,
  kind: "errors" | "warnings",
  failed: Failed,
): readonly Issue[] => {
  const count = counts[kind];
  const { form } = published;
  if (form[count] === 0 && failed.size === 0) return none;
  const issues: Issue[] = [];
  const push = (issue: Issue) => issues.push(Object.freeze(issue));
  const header = published.fieldStates as States;
  for (const message of form[kind]) push({ message });
  for (const field of fieldNames(compiled.fields))
    for (const message of messagesOf(header, field, kind, failed.get(field)))
      push({ field, message });
  const failing = failingRows(failed);
  for (const [collection, compiledCollection] of compiled.collections) {
    const scope = form.collections[collection] as ScopeState;
    if (scope[count] === 0 && !failing.has(collection)) continue;
    for (const message of scope[kind]) push({ collection, message });
    const fields = fieldNames(compiledCollection.fields);
    const rows = published.store.collections.get(collection);
    for (const key of rows?.order ?? []) {
      const row = rows?.rows.get(key) as Row;
      const scoped = published.rowScopes.get(key) as ScopeState;
      if (scoped[count] === 0 && !failing.has(row)) continue;
      for (const message of scoped[kind]) push({ collection, key, message });
      const states = published.rowStates.get(key) as States;
      for (const field of fields)
        for (const message of messagesOf(states, field, kind, failed.get(rowAddress(row, field))))
          push({ collection, key, field, message });
    }
  }
  return Object.freeze(issues);
};

// The messages of a field, with the one of its failed query after them, once.
const messagesOf = (
  states: States,
  name: string,
  kind: "errors" | "warnings",
  failure: string | undefined,
): readonly string[] => {
  const messages = (states[name] as States[string])[kind];
  return failure === undefined || messages.includes(failure) ? messages : [...messages, failure];
};

// The rows with a failed query, and their collections.
const failingRows = (failed: Failed) => {
  const found = new Set<Row | string>();
  for (const address of failed.keys())
    if (typeof address !== "string") found.add(address.row).add(address.row.collection.name);
  return found;
};
