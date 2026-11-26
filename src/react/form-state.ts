// The state of one scope for a component: the form of a session, one of its
// collections, or a row. Its own errors are those the policy of the binding
// shows, with the external ones after them, always; its warnings, its counts
// and dirty are whole; and it has its marks.
// It keeps its object while that content does not change, so the hook of a
// row does not render for another, and a removed row gives undefined.
import { useMemo, useSyncExternalStore } from "react";
import type { FormDefinition, RowHandle, RowSnapshot, Session } from "../core/index.js";
import { showsErrors, visibleErrors, type ShowErrors } from "./visible-messages.js";

type Scope = {
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly dirty: boolean;
};
type View = Omit<Scope, "externalErrors"> & Readonly<Record<string, unknown>>;
type Source = Session<FormDefinition> | RowHandle;

export const formStateOf =
  (policy: ShowErrors) =>
  (source: Source, collection?: string): View | undefined => {
    if ("definition" in source && collection !== undefined && !hasCollection(source, collection))
      throw new Error(`Unknown collection "${collection}"`);
    const select = useMemo(() => selectorOf(source, collection, policy), [source, collection]);
    return useSyncExternalStore(source.subscribe, select);
  };
const hasCollection = (session: Session<FormDefinition>, name: string) =>
  Object.hasOwn(session.definition.collections, name);

// What a scope reads of the snapshot of its source: the form without its
// collections, a collection, or a row without its values, states, reset
// version and queries, and whether it shows its own errors. Its view has the
// errors shown in place of the two lists, and keeps its object while the
// scope read and whether it shows are the same, and, when they are not, while
// its content is.
const selectorOf = (source: Source, collection: string | undefined, policy: ShowErrors) => {
  let held: object | undefined;
  let heldShown = false;
  let last: View | undefined;
  const view = (scope: Scope, shown: boolean, omitted: readonly string[]) => {
    if (last !== undefined && scope === held && shown === heldShown) return last;
    held = scope;
    heldShown = shown;
    const errors = visibleErrors(scope, shown, last?.errors);
    const candidate = { ...withoutKeys(scope, omitted), errors };
    if (last === undefined || !sameView(last, candidate)) last = Object.freeze(candidate);
    return last;
  };
  if ("definition" in source)
    return () => {
      const { form } = source.getSnapshot();
      if (collection !== undefined) {
        const scope = (form.collections as Readonly<Record<string, Scope>>)[collection] as Scope;
        return view(scope, form.attempted, external);
      }
      return view(form, form.attempted, ofForm);
    };
  return () => {
    const row: RowSnapshot | undefined = source.getSnapshot();
    if (row === undefined) return (last = undefined);
    return view(row, showsErrors(policy, row.touched, row.attempted), ofRow);
  };
};
// What a view leaves out of each scope: the external errors, which are among
// its errors, and what is not of the scope alone.
const external = ["externalErrors"];
const ofForm = [...external, "collections"];
const ofRow = [...external, "values", "fieldStates", "resetVersion", "queries"];
const withoutKeys = (scope: Scope, keys: readonly string[]): View => {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(scope))
    if (!keys.includes(key)) rest[key] = (scope as Readonly<Record<string, unknown>>)[key];
  return rest as View;
};
const sameView = (a: View, b: View) => {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
};
