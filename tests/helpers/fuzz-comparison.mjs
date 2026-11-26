import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { editOracle } from "./edit-oracle.mjs";
import { currentOf, observedRun, originOf } from "./fuzz-build.mjs";
import { inTurn } from "./rows-queries.mjs";
import { caseOf } from "./rule-sets-fuzz-forms.mjs";
import { runSession } from "./rule-sets-fuzz-run.mjs";
import { random } from "./rule-sets-fuzz.mjs";

const seeds = [1, 2, 3, 4];
const failure = (step) => typeof (step?.error ?? step?.open) === "string";

export const formCount = (arg) => {
  const count = Number(arg ?? 4000);
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("A positive integer is required per seed");
  return count;
};

export const basePath = (arg) => {
  const base = arg ?? process.env.TRAMA_BASE;
  if (!base) throw new Error("Specify the path to the built base tree or set TRAMA_BASE");
  return resolve(base);
};

export const baseOptions = () => {
  const [base, count] = process.env.TRAMA_BASE
    ? [undefined, process.argv[2]]
    : process.argv.slice(2);
  return {
    base: basePath(base),
    forms: formCount(count),
    edits: process.env.FUZZ_EDITS === "1",
  };
};

const counts = () => ({
  forms: 0,
  steps: 0,
  failedSteps: 0,
  equal: 0,
  differ: 0,
  equalSteps: 0,
  differentSteps: 0,
  equalPublications: 0,
  fixedPoints: 0,
  acceptedSteps: 0,
  validatedAcceptedSteps: 0,
  responsePasses: 0,
  notFixed: 0,
  invalidDrivers: 0,
  reachedSteps: 0,
  reachedWrittenRows: 0,
  examples: [],
});

const compareSteps = (summary, { seed, index, form, expected, actual, evidence, validate }) => {
  const oracle = validate ? editOracle(form) : undefined;
  const example = (item) => {
    if (summary.examples.length < 5) summary.examples.push(item);
  };
  let same = true;
  let sound = true;
  for (let step = 0; step < Math.max(expected.length, actual.length); step++) {
    const target = actual[step];
    const operation = step === 0 ? ["open"] : form.operations[step - 1];
    const location = { seed, index, step, operation };
    summary.steps++;
    if (failure(expected[step])) summary.failedSteps++;
    if (target && !failure(target)) summary.acceptedSteps++;
    if (evidence[step]?.reached) summary.reachedSteps++;
    if (!isDeepStrictEqual(expected[step], target)) {
      if (same) example({ ...location, expected: expected[step], actual: target });
      same = false;
      summary.differentSteps++;
      continue;
    }
    summary.equalSteps++;
    summary.equalPublications += target.publications?.length ?? 0;
    if (!oracle || !same || !sound) continue;
    if (!failure(target)) summary.validatedAcceptedSteps++;
    const responses = evidence[step]?.responses ?? [];
    summary.responsePasses += responses.length;
    const verdict = oracle(operation, target, responses);
    if (verdict.why) {
      summary.notFixed++;
      example({ ...location, why: verdict.why, form });
      sound = false;
    } else if (!failure(target) && verdict.points > 0) {
      summary.fixedPoints++;
      // Pinpoint steps where a command activated the derived member of a row
      // by writing it, with its reads unchanged, whether it repeated the value.
      if (
        evidence[step]?.reached &&
        [...(verdict.forced ?? [])].some((actor) => !actor.startsWith("."))
      )
        summary.reachedWrittenRows++;
    }
    summary.invalidDrivers += verdict.invalid ?? 0;
  }
  summary.forms++;
  summary[same ? "equal" : "differ"]++;
};

const forSeed = (summary, { forms, original, current, full, validate, edits }, seed) => {
  const first = original.random(seed);
  const second = random(seed);
  const size = { rows: 6, operations: 30, edits, relations: full };
  return inTurn(
    Array.from({ length: forms }, (_, index) => index),
    async (index) => {
      const left = original.caseOf(original.core, first, size);
      const right = caseOf(current, second, size);
      if (
        !isDeepStrictEqual(left.form, right.form) ||
        !isDeepStrictEqual(left.pieces, right.pieces)
      )
        throw new Error(`Generators out of sync: seed ${seed}, form ${index}`);
      const expected = await runSession(original.core, left.composed, left.form);
      const { result: actual, evidence } = await observedRun(current, right.composed, right.form, {
        reach: full,
        responses: validate,
      });
      compareSteps(summary, {
        seed,
        index,
        form: right.form,
        expected,
        actual,
        evidence,
        validate,
      });
    },
  );
};

export const compareFuzz = async ({
  forms,
  base,
  full = false,
  validate = false,
  edits = full,
}) => {
  const folder = full || validate ? await mkdtemp(join(tmpdir(), "trama-fuzz-")) : undefined;
  try {
    const original = await originOf(folder, base);
    const current = await currentOf(folder, { reach: full, responses: validate });
    const summary = counts();
    const config = { forms, original, current, full, validate, edits };
    await inTurn(seeds, (seed) => forSeed(summary, config, seed));
    console.log(JSON.stringify(summary));
    if (
      summary.differ > 0 ||
      summary.notFixed > 0 ||
      (full && (summary.reachedSteps === 0 || summary.reachedWrittenRows === 0))
    )
      process.exitCode = 1;
  } finally {
    if (folder !== undefined) await rm(folder, { recursive: true, force: true });
  }
};
