// What an operation publishes of the states: it combines them, derives those
// a session publishes, with validation and dirty, and counts its scopes.
import type { Compiled } from "./compiled.js";
import { deriveStates, marksOf, type Derivation, type Derived, type Marking } from "./derived.js";
export type { Marking } from "./derived.js";
import type { Deriver } from "./derived-fields.js";
import { publishStates, type Affected, type Published } from "./publication.js";
import type { StateFormula } from "./rules.js";
import { countScopes, type Scopes } from "./scope-states.js";
import type { Contributions } from "./states.js";
import type { Store } from "./tree.js";
import { checked } from "./validation.js";
import { rebasing } from "./rebase.js";

// What a state carries of the states: those that combine, those published and
// the states of the scopes.
export type PublishedStates = Published & Derived & Scopes;

// Combines the states, derives those a session publishes from them and counts
// its scopes. The messages of rows, collections and the form reach no field:
// an operation carries them apart from the formulas that combine.
export const publish = (
  compiled: Compiled,
  deriver: Deriver,
  derivation: Pick<Derivation, "store" | "baseline" | "changed"> & {
    readonly previous: (PublishedStates & { readonly store: Store }) | undefined;
    readonly marking?: Marking | undefined;
  },
  contributions: Contributions,
  affected: (Affected & { readonly messages: readonly StateFormula[] }) | undefined,
): PublishedStates => {
  const { store, baseline, previous, marking } = derivation;
  const removed = affected?.removed ?? none;
  // The externals leave with the values that changed, not with what a commit
  // changed of the baseline.
  const marks = marksOf(previous?.marks, marking, derivation.changed, removed);
  // After a commit, dirty compares again what changed of the baseline; a
  // marking derives its fields again as written.
  const rebased = rebasing(compiled, derivation);
  const changed = joined(joined(derivation.changed, rebased?.addresses), marking?.addresses);
  const published = publishStates(compiled, store, contributions, previous, affected);
  const { headerStates, rowStates, rows, locked, recombined } = published;
  const raw = { headerStates, rowStates, rows, locked };
  const derived = deriveStates(compiled, deriver, {
    store,
    baseline,
    previous,
    changed,
    raw,
    rows: affected && { recombined, removed },
    unchecked: unchecked(affected),
    marks,
  });
  const scopes = countScopes(compiled, {
    store,
    baseline,
    previous,
    derivedHeader: derived.derivedHeader,
    derivedRows: derived.derivedRows,
    marks,
    contributions,
    messages: affected?.messages ?? none,
    rows: joined(derived.counted, rebased?.rows) ?? derived.counted,
    removed,
    structure: structureOf(changed),
    all: affected === undefined,
  });
  return statesOf(raw, derived, marks, derivation.baseline, scopes);
};
// What a state carries of an operation, its fields named one by one.
const statesOf = (
  raw: Published,
  derived: ReturnType<typeof deriveStates>,
  marks: Derived["marks"],
  baseline: Store,
  { form, rowScopes, tallies }: Scopes,
): PublishedStates => ({
  ...raw,
  fieldStates: derived.fieldStates,
  derivedHeader: derived.derivedHeader,
  derivedRows: derived.derivedRows,
  baseline,
  marks,
  form,
  rowScopes,
  tallies,
});
// Whether the combined states changed only in what no message reads.
const unchecked = (
  affected: (Affected & { readonly messages: readonly StateFormula[] }) | undefined,
) =>
  affected !== undefined &&
  affected.messages.length === 0 &&
  affected.replaced.every((formula) => unread(formula));
const none: readonly never[] = Object.freeze([]);
// Both sets, the first one when the second adds nothing.
const joined = <T>(first: ReadonlySet<T> | undefined, second: ReadonlySet<T> | undefined) => {
  if (second === undefined || second.size === 0) return first;
  const both = new Set(first);
  for (const item of second) both.add(item);
  return both;
};
// A formula of a property that no message reads.
const unread = (formula: StateFormula) => formula.kind === "property" && !checked(formula.property);
const noNames: ReadonlySet<string> = new Set();
const structureOf = (changed: Derivation["changed"]) => {
  let names: Set<string> | undefined;
  for (const address of changed ?? [])
    if (typeof address !== "string" && address.kind === "structure")
      (names ??= new Set()).add(address.collection.name);
  return names ?? noNames;
};
