// The own messages of a scope above the fields: those that the formulas of a
// row, a collection or the form contribute, each once, in declaration order.
import type { StateFormula } from "./rules.js";
import type { Contributions } from "./states.js";

const none: readonly string[] = Object.freeze([]);
// The messages of the formulas of a scope.
export type Own = { readonly errors: readonly string[]; readonly warnings: readonly string[] };
// The messages of a collection, or of the form without one: the formulas of
// the form hold no messages of rows, which each collection holds.
export const ownOf = (
  formulas: readonly StateFormula[],
  contributions: Contributions,
  collection?: string,
) => messagesOf(groupsOf(formulas).get(collection) ?? noFormulas, contributions);
const noFormulas: readonly StateFormula[] = [];
// The messages of each collection and of the form, grouped once per form.
const groups = new WeakMap<
  readonly StateFormula[],
  ReadonlyMap<string | undefined, StateFormula[]>
>();
const groupsOf = (formulas: readonly StateFormula[]) => {
  let found = groups.get(formulas);
  if (found === undefined) {
    const grouped = new Map<string | undefined, StateFormula[]>();
    for (const formula of formulas) {
      const key = formula.own?.collection;
      const group = grouped.get(key);
      if (group === undefined) grouped.set(key, [formula]);
      else group.push(formula);
    }
    groups.set(formulas, (found = grouped));
  }
  return found;
};
export const silent: Own = { errors: none, warnings: none };
export const messagesOf = (
  formulas: readonly (StateFormula | undefined)[],
  contributions: Contributions,
): Own => {
  if (formulas.length === 0) return silent;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const formula of formulas) {
    if (formula === undefined || formula.kind !== "property") continue;
    const message = contributions.get(formula);
    if (typeof message !== "string") continue;
    const list = formula.property === "error" ? errors : warnings;
    if (!list.includes(message)) list.push(message);
  }
  return errors.length + warnings.length === 0
    ? silent
    : {
        errors: errors.length === 0 ? none : errors,
        warnings: warnings.length === 0 ? none : warnings,
      };
};
