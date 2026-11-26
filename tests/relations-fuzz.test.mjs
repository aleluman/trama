import assert from "node:assert/strict";
import { test } from "node:test";
import * as trama from "trama-forms/core";
import { addressOf, checkCase, scopeOf } from "./helpers/edit-oracle-fuzz-case.mjs";
import { caseOf, coreOf } from "./helpers/rule-sets-fuzz-forms.mjs";
import { random } from "./helpers/rule-sets-fuzz.mjs";
import { inTurn } from "./helpers/rows-queries.mjs";

const core = coreOf(trama);
const size = { rows: 6, operations: 30, edits: true, synchronous: true, relations: true };
const forms = Number(process.env.FUZZ_FORMS ?? 1000);

for (const seed of [1, 2, 3, 4])
  test(`seed ${seed}: relation fuzzing preserves composition and fixed points`, async (t) => {
    const rng = random(seed);
    const covered = new Set();
    let unique = 0;
    let invalid = 0;
    await inTurn(
      Array.from({ length: forms }, (_, index) => index),
      async (index) => {
        const found = caseOf(core, rng, size);
        const verdict = await checkCase(core, seed, index, found);
        unique += verdict.unique;
        invalid += verdict.invalid;
        for (const actor of verdict.forced) covered.add(scopeOf(actor));
        for (const atom of found.pieces.slice(0, -1).flat())
          if (atom.property === "relation" && verdict.forced.has(addressOf(atom)))
            covered.add(`included ${scopeOf(addressOf(atom))}`);
      },
    );
    assert.deepEqual([...covered].toSorted(), ["header", "included header", "included row", "row"]);
    assert.ok(unique > forms && invalid > 0);
    t.diagnostic(`${unique} steps with a unique acyclic result, ${invalid} rejected drivers`);
  });
