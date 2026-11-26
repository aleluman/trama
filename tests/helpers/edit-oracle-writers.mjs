import { changedSince, equal, fieldValue, local, member } from "./edit-oracle-cause.mjs";
import { relationValue } from "./edit-oracle-relations.mjs";

const structure = (scope) => `:${scope}`;
const interpret = (form, spec, expression, board, read, cause) => {
  const [kind, name, peek, offset] = expression;
  switch (kind) {
    case "const":
      return name;
    case "context":
      return form.context ? form.contextValue.k : 0;
    case "omit":
      return;
    case "self": {
      const value = cause.changed.get(local(spec, name));
      return typeof value === "number" ? value : (value?.length ?? 0);
    }
    case "before":
      return interpret(
        form,
        spec,
        name,
        cause.before,
        (field) => cause.before.values.get(field),
        cause,
      );
    case "head":
    case "row":
      return (read(kind === "head" ? name : local(spec, name), peek) ?? 0) + offset;
    default: {
      read(structure(name), offset);
      const keys = board.rows.get(name);
      if (kind === "len") return keys.length;
      const cell = (key) => read(member(name, key, peek), offset) ?? 0;
      if (kind === "first") return keys.length === 0 ? 0 : cell(keys[0]);
      return keys.reduce((sum, key) => sum + cell(key), 0);
    }
  }
};

const destinations = (branch, spec, board, valueOf) => {
  const entries = new Map();
  for (const [kind, target, field, expression] of branch)
    entries.set(
      target,
      kind === "rows"
        ? board.rows.get(target).map((key) => [member(target, key, field), valueOf(expression)])
        : [[local(spec, target), valueOf(field)]],
    );
  return new Map([...entries.values()].flat());
};

export const instances = (atoms, board) => {
  const rules = [];
  for (const atom of atoms)
    if (atom.scope === null) rules.push(atom);
    else for (const key of board.rows.get(atom.scope)) rules.push({ ...atom, key });
  return rules;
};

const trackedOf = (form, spec, board, cause) => {
  const reads = new Set();
  interpret(
    form,
    spec,
    (spec.item ?? spec.model).e,
    board,
    (field, peek) => {
      if (!peek) reads.add(field);
      return fieldValue(board, field);
    },
    cause,
  );
  return reads;
};

export const observerFails = (form, observers, cause, board) =>
  instances(observers, board).some((spec) => {
    const own = local(spec, spec.name);
    const active =
      !cause.prior?.values.has(own) ||
      changedSince(board, cause.prior, trackedOf(form, spec, cause.prior, cause));
    return (
      active &&
      interpret(form, spec, spec.item.e, board, (field) => fieldValue(board, field), cause) === 3
    );
  });

export const evaluator = (form, spec, board, cause, previousReads) => {
  if (spec.driver !== undefined) return relationValue(spec, board, cause, previousReads);
  const { property, model, name } = spec;
  const own = local(spec, name);
  const read = (field) =>
    property === "onEdit" && field === own ? cause.changed.get(own) : fieldValue(board, field);
  const valueOf = (expression) => interpret(form, spec, expression, board, read, cause);
  if (property === "value") {
    const active = previousReads === undefined || changedSince(board, cause.prior, previousReads);
    if (!active) return {};
    const result = valueOf(model.e);
    return {
      patch: new Map([[own, result === model.skip ? undefined : result]]),
      failure: model.fail && result === 3 ? `${own}.value fails` : undefined,
      reads: trackedOf(form, spec, board, cause),
    };
  }
  const active =
    property === "onEdit"
      ? cause.changed.has(own)
      : cause.prior?.values.has(own) && !equal(own, read(own), cause.prior.values.get(own));
  if (!active) return {};
  const patch = destinations(model.branches[valueOf(model.when) > 1 ? 1 : 0], spec, board, valueOf);
  if (property === "onEdit") for (const written of cause.written.keys()) patch.delete(written);
  return { patch, edit: property === "onEdit" ? `${spec.scope ?? ""}.${name}` : undefined };
};

export const possible = (form, spec, cause, priorReads) => {
  const board = cause.candidate;
  const own = local(spec, spec.name);
  if (spec.driver !== undefined) return [new Set([local(spec, spec.driver)]), [own]];
  const reads = new Set();
  const read = (field) => {
    if (spec.property !== "onEdit" || field !== own) reads.add(field);
    return 0;
  };
  const valueOf = (expression) => interpret(form, spec, expression, board, read, cause);
  if (spec.property === "value") {
    valueOf(spec.model.e);
    for (const field of priorReads ?? []) reads.add(field);
    return [reads, [own]];
  }
  if (spec.property === "onEdit" ? !cause.changed.has(own) : !cause.prior?.values.has(own))
    return [reads, []];
  if (spec.property === "onChange") reads.add(own);
  valueOf(spec.model.when);
  const targets = new Set();
  for (const branch of spec.model.branches)
    for (const target of destinations(branch, spec, board, valueOf).keys())
      if (spec.property !== "onEdit" || !cause.written.has(target)) targets.add(target);
  return [reads, targets];
};
