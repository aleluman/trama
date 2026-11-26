import type { Row } from "./address.js";
import type { Compiled } from "./compiled.js";
import { paramsOf, stateOf } from "./collections.js";
import type { Delta, Memory } from "./memory.js";
import { evaluateParams, type ParamsFormula } from "./params.js";
import type { Context, Read } from "./reads.js";
import { isState, type EachObserver, type Observer, type StateFormula } from "./rules.js";
import { evaluateState, sameContribution } from "./state-evaluation.js";
import type { Rows } from "./tree.js";
import type { Source } from "./views.js";

// The observers a change runs, and the rows it adds, whose formulas of state
// all run; rows lists the rows of both in creation order. The opening and
// restore run every observer.
export type Runs = {
  readonly observers: ReadonlySet<Observer>;
  readonly added: ReadonlySet<Row>;
  readonly rows: readonly Row[];
};

// Formulas of state and params observe the resolved values, in declaration
// order; a formula of state or of params of a collection observes in its place
// for every row, in creation order. Each formula of state that runs replaces
// its reads and its contribution, and withdraws it when it returns none; each
// params formula, of a field or of a query, replaces its reads and the params
// at its address, keeping those in force while they are equal as data.
// Returns the formulas of state whose contribution changed, the only ones the
// delta carries: those that combine into fields, and the messages of rows,
// collections and the form, which reach no field.
export const observe = (
  compiled: Compiled,
  context: Context,
  source: Source,
  read: Read,
  runs: Runs | undefined,
  into: { readonly memory: Memory; readonly delta: Delta },
  collections: ReadonlyMap<string, Rows>,
) => {
  const replaced: StateFormula[] = [];
  const messages: StateFormula[] = [];
  const { memory, delta } = into;
  const state = (formula: StateFormula) => {
    const { reads, contribution } = evaluateState(compiled, formula, source, read, context);
    delta.observers.set(formula, reads);
    if (sameContribution(memory.contributions.get(formula), contribution)) return;
    delta.contributions.set(formula, contribution);
    (formula.own === undefined ? replaced : messages).push(formula);
  };
  // A change writes only params whose object changed, or that it evaluates the
  // first time; the opening and restore write every one in new maps.
  const params = (formula: ParamsFormula) => {
    const query = formula.kind === "query";
    const held = query ? memory.queryParams : memory.params;
    const previous = held.get(formula.address);
    const evaluation = evaluateParams(formula, source, read, previous, context);
    delta.observers.set(formula, evaluation.reads);
    if (delta.params.whole || evaluation.params !== previous || !held.has(formula.address))
      (query ? delta.params.queryParams : delta.params.params).set(
        formula.address,
        evaluation.params,
      );
  };
  const run = (formula: Observer) => (isState(formula) ? state(formula) : params(formula));
  for (const formula of compiled.observers)
    if (formula.kind === "each") runEach(formula, runs, collections, run);
    else if (runs === undefined || runs.observers.has(formula)) run(formula);
  return { replaced, messages };
};

// The instances of a row exist since it first ran: a row that runs again
// needs only those of the observers that read what changed.
const runEach = (
  { collection, template }: EachObserver,
  runs: Runs | undefined,
  collections: ReadonlyMap<string, Rows>,
  run: (formula: Observer) => void,
) => {
  for (const row of runs?.rows ?? collections.get(collection.name)?.created ?? []) {
    if (row.collection !== collection) continue;
    if (runs === undefined || runs.added.has(row))
      run(isState(template) ? stateOf(row, template) : paramsOf(row, template));
    else {
      const instance = row.instances.get(template) as Observer | undefined;
      if (instance !== undefined && runs.observers.has(instance)) run(instance);
    }
  }
};
