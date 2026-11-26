import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { test } from "node:test";
import * as trama from "trama-forms/core";
import { flags, random } from "./helpers/rule-sets-fuzz.mjs";
import { caseOf, coreOf, crossedIn } from "./helpers/rule-sets-fuzz-forms.mjs";
import { runSession } from "./helpers/rule-sets-fuzz-run.mjs";
import { inTurn } from "./helpers/rows-queries.mjs";

// The differential fuzz of rule sets, at the size of the check: random forms
// whose rules are cut into rule sets, by entries or by contributions, run
// against their twin written inline. After each operation both sessions must
// leave the same values, states, queries, outputs, publications, requests
// and first failure. Each seed must reach writers crossed between sets: in
// the header, in a row, and from the header to the rows.

const core = coreOf(trama);
const size = { rows: 6, operations: 30 };
const seeds = [1, 2, 3, 4];
const forms = Number(process.env.FUZZ_FORMS ?? 1000);
const stateProperties = [...flags, "label", "placeholder", "states"];

// Compares the steps of a case and gives the first one that differs.
const compare = async (seed, index, { form, mode, twin, composed }) => {
  const expected = await runSession(core, twin, form);
  const actual = await runSession(core, composed, form);
  const at = expected.findIndex((step, n) => !isDeepStrictEqual(step, actual[n]));
  if (at !== -1)
    assert.deepEqual(
      actual[at],
      expected[at],
      `seed ${seed}, form ${index} (${mode}), step ${at}: ${JSON.stringify(form.operations[at - 1])}`,
    );
  return expected;
};

for (const seed of seeds)
  test(`Seed ${seed} checks that each composed form behaves like its inline counterpart`, async () => {
    const r = random(seed);
    const counts = { crossed: new Set(), states: 0, queries: 0, errors: 0 };
    await inTurn(
      Array.from({ length: forms }, (_, index) => index),
      async (index) => {
        const found = caseOf(core, r, size);
        for (const kind of crossedIn(found.pieces)) counts.crossed.add(kind);
        const steps = await compare(seed, index, found);
        const properties = new Set(found.atoms.map(({ property }) => property));
        counts.errors += steps.filter((step) => step.error !== null).length;
        if (properties.has("query")) counts.queries++;
        if (stateProperties.some((property) => properties.has(property))) counts.states++;
      },
    );
    assert.deepEqual([...counts.crossed].toSorted(), ["header", "header-rows", "row"]);
    assert.ok(counts.queries > 0 && counts.states > 0 && counts.errors > 0);
  });

// A form whose target formula fails in the row whose source is bad.
const failingAt = (bad) =>
  trama.defineForm({
    fields: {},
    collections: {
      lines: { fields: { source: trama.field.number(), target: trama.field.number() } },
    },
    rules: {
      lines: {
        each: {
          target: {
            value: ({ source }) => {
              if (source === bad) throw new Error("boom");
              return source;
            },
          },
        },
      },
    },
  });
test("The comparator distinguishes which row causes opening to fail", async () => {
  const form = { initial: { lines: [{ source: 1 }, { source: 2 }] }, context: false };
  const [first, second] = [
    await runSession(core, failingAt(1), form),
    await runSession(core, failingAt(2), form),
  ];
  assert.deepEqual(
    [first, second].map(([{ open }]) => open),
    [
      'Field "target" of "lines" row #0 value: formula failed: boom',
      'Field "target" of "lines" row #1 value: formula failed: boom',
    ],
  );
});
