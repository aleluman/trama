// The states a scope publishes: those of each of its fields, derived from
// those they combine, in one object that the rows alike share.
import { defineOwn } from "./data.js";
import { deriveField, type Deriver } from "./derived-fields.js";
import type { ScopeMarks } from "./marks.js";
import type { Fields } from "./definition.js";
import type { States } from "./states.js";
import { sameChecks } from "./validation.js";

// What changed of a scope: every field, the names written, none, or, at
// restore, the values published before, which each field compares with.
export const all = true;
export type Written = true | ReadonlySet<string> | Readonly<Record<string, unknown>> | undefined;
const isWritten = (written: Written, name: string, value: unknown) =>
  written === true ||
  (written instanceof Set
    ? written.has(name)
    : written !== undefined && !Object.is(value, (written as Record<string, unknown>)[name]));
// The names of the fields of a scope, once per object of fields.
const namesOf = new WeakMap<Fields, readonly string[]>();
export const fieldNames = (fields: Fields) => {
  let found = namesOf.get(fields);
  if (found === undefined) namesOf.set(fields, (found = Object.keys(fields)));
  return found;
};
// A scope also has the marks of its fields, if any, and whether some of them
// holds externals.
type Scope = {
  readonly before: States | undefined;
  readonly rawBefore: States | undefined;
  readonly values: Readonly<Record<string, unknown>>;
  readonly base: Readonly<Record<string, unknown>> | undefined;
  readonly written: Written;
  readonly marks: ScopeMarks | undefined;
  readonly external: boolean;
};

// Every field of a scope, keeping the object when no state changed. A field
// that published its combined state, whose value did not change and whose new
// combined state validates alike, publishes the new one as it is.
export const deriveScope = (
  deriver: Deriver,
  fields: Fields,
  raw: States,
  scope: Scope,
  states: States[string][] = [],
) => {
  const { before, rawBefore, values, base, written, marks, external } = scope;
  const names = fieldNames(fields);
  states.length = 0;
  let kept = before !== undefined;
  let combined = true;
  for (const name of names) {
    const held = before?.[name];
    const state = raw[name] as States[string];
    const value = values[name];
    const changed = isWritten(written, name, value);
    const mark = marks?.get(name);
    // A field that published its combined state, unmarked, keeps publishing it.
    const next =
      !changed &&
      held !== undefined &&
      held === rawBefore?.[name] &&
      mark === undefined &&
      sameChecks(held, state)
        ? state
        : deriveField(
            deriver,
            (fields[name] as Fields[string]).type,
            value,
            base?.[name],
            state,
            held,
            changed,
            mark,
          );
    kept &&= next === held;
    combined &&= next === state;
    states.push(next);
  }
  if (kept) return before as States;
  // Fields that all publish as they combined share the combined states.
  if (combined) return raw;
  const next: Record<string, States[string]> = {};
  for (const [index, name] of names.entries())
    if (name === "__proto__") defineOwn(next, name, states[index]);
    else next[name] = states[index] as States[string];
  return deriver.scope(raw, next, names, external);
};

// The written fields of a scope whose combined states did not change: only
// they derive again, on a copy of the states published.
export const deriveNames = (
  deriver: Deriver,
  fields: Fields,
  written: Iterable<string>,
  values: Readonly<Record<string, unknown>>,
  base: Readonly<Record<string, unknown>> | undefined,
  raw: States,
  before: States,
  marks: ScopeMarks | undefined,
  external: boolean,
) => {
  let next: Record<string, States[string]> | undefined;
  for (const name of written) {
    const state = deriveField(
      deriver,
      (fields[name] as Fields[string]).type,
      values[name],
      base?.[name],
      raw[name] as States[string],
      before[name],
      true,
      marks?.get(name),
    );
    if (state === before[name]) continue;
    next ??= { ...before };
    if (name === "__proto__") defineOwn(next, name, state);
    else next[name] = state;
  }
  if (next === undefined) return before;
  const names = fieldNames(fields);
  // Fields that all publish as they combined share the combined states.
  const derived = next;
  return names.every((name) => derived[name] === raw[name])
    ? raw
    : deriver.scope(raw, derived, names, external);
};

// Whether no field of a scope validates, once per object of states, which rows
// alike share.
const unvalidated = new WeakMap<States, boolean>();
export const validatesNothing = (states: States) => {
  let found = unvalidated.get(states);
  if (found === undefined) {
    found = true;
    for (const name in states) {
      const state = states[name] as States[string];
      if (state.required || state.min !== undefined || state.max !== undefined) found = false;
    }
    unvalidated.set(states, found);
  }
  return found;
};

// Whether the new combined states of a scope validate as those before.
export const validatesAlike = (fields: Fields, before: States, after: States) =>
  fieldNames(fields).every((name) => {
    const was = before[name] as States[string];
    const is = after[name] as States[string];
    return was === is || sameChecks(was, is);
  });
