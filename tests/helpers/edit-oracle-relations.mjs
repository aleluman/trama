import { changedSince, local } from "./edit-oracle-cause.mjs";
import { emptyDriver } from "./relation-fuzz.mjs";

export const writersOf = (atom) => {
  if (atom.property !== "relation") return [atom];
  const { name: driver, model, scope } = atom;
  const ordered = model.members.toSorted(
    (left, right) => Number(left === model.default) - Number(right === model.default),
  );
  const formulas = model.members.map((name) => ({ scope, driver, model, name, property: "value" }));
  const edits = ordered.map((name) => {
    const branch = [[scope === null ? "head" : "row", driver, ["const", name]]];
    return {
      scope,
      name,
      property: "onEdit",
      model: { when: ["const", 0], branches: [branch, branch] },
    };
  });
  return [...formulas, ...edits];
};

const leaderOf = (spec, board, driver) => {
  const value = board.values.get(driver);
  return value === emptyDriver(spec) ? spec.model.default : value;
};

// In this model only the generated edits can write a driver, and an edit
// cannot replace a driver's explicit input. This also proves rejection when
// an unrelated cycle prevents the solver from producing a unique board.
export const invalidDriver = (spec, board) =>
  !spec.model.members.includes(leaderOf(spec, board, local(spec, spec.name)));

const inputsOf = (spec, board) => {
  const driver = local(spec, spec.driver);
  const leader = leaderOf(spec, board, driver);
  if (leader === spec.name || !spec.model.members.includes(leader)) return [driver];
  return [driver, local(spec, leader), spec.model.headerBase ? "base" : local(spec, "base")];
};

// Once the driver is settled, only the derived member depends on its partner.
// If the role changed, the driver's change alone activates the formula.
export const relationDependencies = (spec, board, cause, previous) => {
  const current = inputsOf(spec, board);
  if (current.length === 1 || !previous || changedSince(board, cause.prior, [current[0]]))
    return current;
  return new Set([...current, ...previous]);
};

export const relationValue = (spec, board, cause, previous) => {
  const own = local(spec, spec.name);
  const inputs = inputsOf(spec, board);
  const [driver, partner, base] = inputs;
  const forced = cause.written.has(own);
  const changed = previous === undefined || changedSince(board, cause.prior, previous);
  if (!forced && !changed) return {};
  if (!spec.model.members.includes(leaderOf(spec, board, driver)))
    return { failure: `${driver}: unknown driver` };
  const reads = new Set(inputs);
  if (partner === undefined) return { reads };
  const scale = board.values.get(base);
  return {
    reads,
    patch:
      scale === spec.model.skip ? undefined : new Map([[own, board.values.get(partner) + scale]]),
    forced: forced && !changed ? `${spec.scope ?? ""}.${spec.driver}` : undefined,
  };
};
