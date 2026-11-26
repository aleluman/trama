import assert from "node:assert/strict";
import { test } from "node:test";
import * as trama from "trama-forms/core";
import { addressOf, checkCase, scopeOf } from "./helpers/edit-oracle-fuzz-case.mjs";
import { caseOf, coreOf, crossedIn } from "./helpers/rule-sets-fuzz-forms.mjs";
import { random } from "./helpers/rule-sets-fuzz.mjs";
import { inTurn } from "./helpers/rows-queries.mjs";

const core = coreOf(trama);
const size = { rows: 6, operations: 30, edits: true, synchronous: true };
const forms = Number(process.env.FUZZ_FORMS ?? 1000);

for (const seed of [1, 2, 3, 4])
  test(`seed ${seed}: edit fuzzing preserves composition and fixed points`, async (t) => {
    const rng = random(seed);
    const crossed = new Set();
    const edits = new Set();
    let unique = 0;
    await inTurn(
      Array.from({ length: forms }, (_, index) => index),
      async (index) => {
        const found = caseOf(core, rng, size);
        const { actors, unique: solved } = await checkCase(core, seed, index, found);
        unique += solved;
        for (const actor of actors) edits.add(scopeOf(actor));
        const activated = (atom) => atom.property === "onEdit" && actors.has(addressOf(atom));
        const included = found.pieces.slice(0, -1);
        for (const kind of crossedIn(included, activated)) crossed.add(kind);
      },
    );
    assert.deepEqual([...edits].toSorted(), ["header", "row"]);
    assert.deepEqual([...crossed].toSorted(), ["header", "header-rows", "row"]);
    assert.ok(unique > forms);
    t.diagnostic(`${unique} steps with a unique acyclic result`);
  });
