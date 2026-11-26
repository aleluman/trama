import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as trama from "trama-forms/core";
import { boardOf } from "./edit-oracle-cause.mjs";
import { caseOf, coreOf } from "./rule-sets-fuzz-forms.mjs";
import { runSession } from "./rule-sets-fuzz-run.mjs";
import { random } from "./rule-sets-fuzz.mjs";

const built = new URL("../../dist/", import.meta.url);
const load = async (path) => coreOf(await import(pathToFileURL(path).href));

export const originOf = async (folder, base) => {
  if (!base) return { core: await instrument(folder, "full", { full: true }), caseOf, random };
  const core = await load(join(base, "dist/core/index.js"));
  const frames = await import(
    pathToFileURL(join(base, "tests/helpers/rule-sets-fuzz-forms.mjs")).href
  );
  const seeds = await import(pathToFileURL(join(base, "tests/helpers/rule-sets-fuzz.mjs")).href);
  return { core, caseOf: frames.caseOf, random: seeds.random };
};

export const currentOf = (folder, { reach, responses }) =>
  folder ? instrument(folder, "current", { reach, responses }) : coreOf(trama);

const replaceOnce = (source, text, replacement) => {
  const start = source.indexOf(text);
  if (start === -1 || source.indexOf(text, start + text.length) !== -1)
    throw new Error(`Could not find a unique instrumentation point: ${text}`);
  return source.replace(text, replacement);
};

const instrument = async (folder, label, { full, reach, responses }) => {
  const dist = join(folder, label);
  await cp(built, dist, { recursive: true });
  const path = join(dist, "core/operation.js");
  const call = "const resolution = resolveValues(program, pass, reach);";
  let code = await readFile(path, "utf8");
  if (full)
    code = replaceOnce(code, call, "const resolution = resolveValues(program, pass, undefined);");
  if (reach)
    code = replaceOnce(
      code,
      call,
      `if (reach !== undefined) globalThis.tramaFuzzReach();\n    ${call}`,
    );
  if (responses) {
    code = replaceOnce(
      code,
      call,
      `const record = globalThis.tramaFuzzResponse(candidate, change);\n    ${call}`,
    );
    const finish =
      "return observed(compiled, given, change, store, memory, resolution, published);";
    code = replaceOnce(
      code,
      finish,
      `const result = ${finish.slice("return ".length)}\n    record?.(store);\n    return result;`,
    );
  }
  await writeFile(path, code);
  return load(join(dist, "core/index.js"));
};

const snapshot = ({ values, collections }, name) => ({
  header: Object.fromEntries(Object.entries(values).filter(([field]) => !collections.has(field))),
  rows: Object.fromEntries(
    [...collections].map(([collection, draft]) => [
      collection,
      draft.order.map((key) => [
        name(key),
        { ...(draft.written?.get(key) ?? draft.records.published[draft.records.at.get(key)]) },
      ]),
    ]),
  ),
});

export const observedRun = async (core, definition, form, { reach, responses }) => {
  const evidence = [];
  if (!reach && !responses) return { result: await runSession(core, definition, form), evidence };
  let reached = false;
  let passes = [];
  let capture = false;
  let normalize;
  globalThis.tramaFuzzReach = () => (reached = true);
  globalThis.tramaFuzzResponse = (candidate, change) => {
    if (!capture || !change) return;
    const input = boardOf(snapshot(candidate, normalize));
    return (store) =>
      passes.push({
        candidate: input,
        prior: boardOf(snapshot(change.previous, normalize)),
        before: boardOf(snapshot(change.eventBefore ?? change.previous, normalize)),
        actual: boardOf(snapshot(store, normalize)),
      });
  };
  let steps = 0;
  const collect = (name) => {
    normalize = name;
    evidence.push({ reached, responses: passes });
    reached = false;
    passes = [];
    capture = ["settle", "batch", "stale"].includes(form.operations[steps++]?.[0]);
  };
  try {
    const result = await runSession(core, definition, form, {
      readPasses: collect,
    });
    return { result, evidence };
  } finally {
    delete globalThis.tramaFuzzReach;
    delete globalThis.tramaFuzzResponse;
  }
};
