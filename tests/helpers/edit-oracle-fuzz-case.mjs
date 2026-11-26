import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { editOracle } from "./edit-oracle.mjs";
import { runSession } from "./rule-sets-fuzz-run.mjs";

export const checkCase = async (core, seed, index, { form, twin, composed }) => {
  const expected = await runSession(core, twin, form);
  const actual = await runSession(core, composed, form);
  const oracle = editOracle(form);
  const evidence = { actors: new Set(), forced: new Set(), unique: 0, invalid: 0 };
  assert.equal(expected.length, actual.length);
  for (const [step, value] of actual.entries()) {
    const op = step === 0 ? ["open"] : form.operations[step - 1];
    const where = () => `seed ${seed}, form ${index}, step ${step}: ${JSON.stringify(op)}`;
    if (!isDeepStrictEqual(value, expected[step])) assert.deepEqual(value, expected[step], where());
    const verdict = oracle(op, value, [], true);
    if (verdict.why !== undefined)
      assert.fail(`${where()}; ${verdict.why}; Trama failure: ${value.error ?? value.open}`);
    if (value.error === null) assert.ok(verdict.points > 0, where());
    evidence.unique += verdict.unique ?? 0;
    evidence.invalid += verdict.invalid ?? 0;
    for (const actor of verdict.edits ?? []) evidence.actors.add(actor);
    for (const relation of verdict.forced ?? []) evidence.forced.add(relation);
  }
  return evidence;
};

export const scopeOf = (actor) => (actor.startsWith(".") ? "header" : "row");
export const addressOf = (atom) => `${atom.scope ?? ""}.${atom.name}`;
