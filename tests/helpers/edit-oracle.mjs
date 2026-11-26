import { atomsOf } from "./rule-sets-fuzz.mjs";
import { boardOf, causeOf, copy, distinct, identify, local } from "./edit-oracle-cause.mjs";
import { invalidDriver, relationDependencies, writersOf } from "./edit-oracle-relations.mjs";
import { evaluator, instances, observerFails, possible } from "./edit-oracle-writers.mjs";

const waiting = ({ spec, reads, previous }, pending, board, cause) =>
  [...reads].some((read) => pending.has(read)) ||
  (spec.driver !== undefined &&
    [...relationDependencies(spec, board, cause, previous)].some((read) => pending.has(read)));

// A DAG of possible inputs (even peek and both branches) proves uniqueness.
// A cyclic supergraph does not imply rejection; it gets only the fixed-point check.
const solve = (form, rules, cause, priorReads) => {
  const board = copy(cause.candidate);
  const pending = new Map([...board.values.keys()].map((field) => [field, []]));
  for (const spec of rules) {
    const previous = priorReads.get(local(spec, spec.name));
    const [reads, targets] = possible(form, spec, cause, previous);
    for (const target of targets) pending.get(target).push({ spec, reads, previous });
  }
  let failure;
  while (pending.size > 0) {
    const count = pending.size;
    for (const [target, writers] of pending) {
      if (writers.some((writer) => waiting(writer, pending, board, cause))) continue;
      for (const { spec, previous } of writers) {
        const result = evaluator(form, spec, board, cause, previous);
        failure ??= result.failure;
        const value = result.patch?.get(target);
        if (value !== undefined && !cause.supplied.has(target)) board.values.set(target, value);
      }
      pending.delete(target);
    }
    if (pending.size === count) return;
  }
  return { board, failure };
};

const fixed = (form, rules, cause, priorReads, actual) => {
  const expected = copy(cause.candidate);
  const reads = new Map();
  const edits = new Set();
  const forced = new Set();
  for (const spec of rules) {
    const own = local(spec, spec.name);
    const result = evaluator(form, spec, actual, cause, priorReads.get(own));
    if (result.failure) return { why: result.failure };
    if (spec.property === "value") reads.set(own, result.reads ?? priorReads.get(own));
    if (result.edit !== undefined) edits.add(result.edit);
    if (result.forced !== undefined) forced.add(result.forced);
    for (const [target, value] of result.patch ?? [])
      if (value !== undefined && !cause.supplied.has(target)) expected.values.set(target, value);
  }
  return { why: distinct(expected, actual), reads, edits, forced };
};

const checkPass = ({ form, writers, observers, reads }, { actual, cause }, unique) => {
  if (!cause.runs) {
    if (actual) return { why: distinct(cause.candidate, actual) };
    return {
      why: cause.kind === "retry" ? undefined : "a step with no value changes was rejected",
    };
  }
  if (
    form.relations &&
    instances(form.relations, cause.candidate).some((spec) => invalidDriver(spec, cause.candidate))
  )
    return actual ? { why: "an unknown driver was accepted" } : { invalid: 1 };
  const rules = instances(writers, cause.candidate);
  const solution = unique && solve(form, rules, cause, reads);
  if (!actual) {
    return solution && !solution.failure && !observerFails(form, observers, cause, solution.board)
      ? { why: "an acyclic graph with no expected failure was rejected" }
      : {};
  }
  const { board, addresses } = identify(actual, cause);
  const solved = Boolean(solution && !solution.failure);
  const mismatch = solved && distinct(solution.board, board);
  if (mismatch) return { why: mismatch };
  const result = fixed(form, rules, cause, reads, board);
  if (result.why) return result;
  const address = (field) => addresses.get(field) ?? field;
  return {
    solved,
    edits: result.edits,
    forced: result.forced,
    reads: new Map(
      [...result.reads].map(([field, tracked]) => [
        address(field),
        new Set([...tracked].map((input) => address(input))),
      ]),
    ),
  };
};

// A response supplies the input of its value pass, including the batch's
// earlier before snapshot. The expectation never reads a resolution result.
const responsePass = ({ actual, prior, before, candidate }) => ({
  actual,
  cause: {
    candidate,
    prior,
    before,
    changed: new Map(),
    written: new Map(),
    supplied: new Set(),
    runs: true,
    kind: "response",
  },
});

const verifyStep = (state, operation, observed, responses = [], unique = false) => {
  const kind = operation[0];
  const accepted = observed.open === undefined && observed.error === null;
  const actual = accepted ? boardOf(observed) : undefined;
  if (kind === "reset") {
    if (!accepted) return state.form.relations ? { why: "reset was rejected" } : {};
    state.prior = actual;
    state.reads = state.openedReads;
    return { why: distinct(state.opening, actual), points: 1 };
  }
  const passes =
    responses.length > 0
      ? responses.map((response) => responsePass(response))
      : [{ actual, cause: causeOf(state.form, state.prior, operation) }];
  const verdict = { points: 0, unique: 0, invalid: 0, edits: new Set(), forced: new Set() };
  for (const pass of passes) {
    const result = checkPass(state, pass, unique);
    if (result.why) return result;
    verdict.invalid += result.invalid ?? 0;
    if (!pass.actual) continue;
    state.prior = pass.actual;
    state.reads = result.reads ?? state.reads;
    verdict.points++;
    if (result.solved) verdict.unique++;
    for (const edit of result.edits ?? []) verdict.edits.add(edit);
    for (const forced of result.forced ?? []) verdict.forced.add(forced);
  }
  if (kind === "open") {
    state.opening = state.prior;
    state.openedReads = state.reads;
  }
  if (responses.length > 0) {
    const why = distinct(state.prior, actual);
    if (why) return { why: `published response: ${why}` };
  }
  return verdict;
};

export const editOracle = (form) => {
  const atoms = atomsOf(form);
  const writers = atoms
    .filter(({ property }) => ["value", "onChange", "onEdit", "relation"].includes(property))
    .flatMap((atom) => writersOf(atom));
  const observers = atoms.filter(({ item }) => item?.fail);
  const state = { form, writers, observers, reads: new Map() };
  return (operation, observed, responses, unique) =>
    verifyStep(state, operation, observed, responses, unique);
};
