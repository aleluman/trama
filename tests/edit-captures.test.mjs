import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { caseOf, coreOf } from "./helpers/rule-sets-fuzz-forms.mjs";
import { runSession } from "./helpers/rule-sets-fuzz-run.mjs";
import { random } from "./helpers/rule-sets-fuzz.mjs";
import { inTurn } from "./helpers/rows-queries.mjs";

// A form without onEdit keeps no direct edits of its commands, which is the
// gate of the 40-field ceilings: no map of its direct edits, and no set of
// what it wrote for the filter of onEdit. A copy of the build counts both, by
// wrapping editsOf and every construction of that set; neither the sources
// nor dist change.
let folder;
let trama;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), "trama-captures-"));
  await cp(new URL("../dist/", import.meta.url), folder, { recursive: true });
  const path = join(folder, "core/candidates.js");
  const code = await readFile(path, "utf8");
  const head = "export const editsOf = (compiled) =>";
  assert.equal(code.split(head).length, 2, "editsOf is declared once");
  await writeFile(
    path,
    `${code.replace(head, "const keptEdits = (compiled) =>")}
export const editsOf = (compiled) => {
  const kept = keptEdits(compiled);
  if (kept !== undefined) globalThis.tramaCaptures += 1;
  return kept;
};
`,
  );
  const pass = join(folder, "core/pass.js");
  const filter = "new Set(change?.roots)";
  const passCode = await readFile(pass, "utf8");
  assert.ok(passCode.includes(filter), "The onEdit filter builds its set");
  await writeFile(pass, passCode.replaceAll(filter, `(globalThis.tramaWritten += 1, ${filter})`));
  trama = await import(pathToFileURL(join(folder, "core/index.js")).href);
});
after(() => rm(folder, { recursive: true, force: true }));

const counted = async (run) => {
  globalThis.tramaCaptures = 0;
  globalThis.tramaWritten = 0;
  await run();
  return { edits: globalThis.tramaCaptures, written: globalThis.tramaWritten };
};
const commands = (session) => {
  const [key] = session.getSnapshot().rows.lines;
  session.edit("debit", 5);
  session.patch({ credit: 7, lines: { [key]: { amount: 3 } } });
  session.row("lines", key).edit("amount", 4);
};
const formWith = (rules) =>
  trama.defineForm({
    fields: { debit: trama.field.number(), credit: trama.field.number() },
    collections: { lines: { fields: { amount: trama.field.number() } } },
    rules,
  });

test("without onEdit, edit, patch, and editing a row do not record direct edits", async () => {
  const plain = formWith({ debit: { onChange: () => ({ credit: 0 }) } });
  const edits = formWith({ debit: { onEdit: () => ({ credit: 0 }) } });
  const open = (definition) => trama.createSession(definition, { initial: { lines: [{}] } });
  assert.deepEqual(await counted(() => commands(open(plain))), { edits: 0, written: 0 });
  // The three commands keep their edits; only the first edits debit, whose
  // onEdit returns a patch to filter.
  assert.deepEqual(await counted(() => commands(open(edits))), { edits: 3, written: 1 });
});

test("the fuzz test forms without onEdit do not record edits for any operation", async () => {
  const core = coreOf(trama);
  const r = random(7);
  let operations = 0;
  const captures = await counted(() =>
    inTurn(
      Array.from({ length: 200 }, (_, index) => index),
      async () => {
        const { form, twin } = caseOf(core, r, { rows: 6, operations: 30 });
        operations += form.operations.length;
        await runSession(core, twin, form);
      },
    ),
  );
  assert.ok(operations > 1000);
  assert.deepEqual(captures, { edits: 0, written: 0 });
});
