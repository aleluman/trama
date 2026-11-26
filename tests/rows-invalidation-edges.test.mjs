import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { keysOf, rejects } from "./helpers/session.mjs";

// Edge cases where incremental invalidation must still publish what the whole
// traversal does: the memory that each reset brings back, batches of any size,
// the identity of states that do not change, and forms whose positions are not
// exact.

test("Every reset follows the opening reads again, even after another reset and edits", () => {
  const session = createSession(
    defineForm({
      fields: {
        alternate: field.checkbox(),
        a: field.number({ default: 2 }),
        b: field.number({ default: 10 }),
        total: field.number(),
      },
      // Each branch reads only its own field.
      rules: { total: { value: (values) => (values.alternate ? values.b : values.a) } },
    }),
  );
  for (let round = 0; round < 3; round++) {
    session.reset();
    session.edit("alternate", true);
    session.edit("b", 20 + round);
    assert.equal(session.getSnapshot().values.total, 20 + round);
  }
  session.reset();
  session.edit("a", 3);
  assert.equal(session.getSnapshot().values.total, 3);
});

test("A batch of 150,000 rows opens and can be added in full, as before", () => {
  const definition = defineForm({ fields: {}, collections: { lines: { fields: {} } } });
  const rows = Array.from({ length: 150_000 }, () => ({}));
  assert.equal(keysOf(createSession(definition, { initial: { lines: rows } })).length, 150_000);
  const session = createSession(definition);
  assert.equal(session.add("lines", rows).length, 150_000);
  assert.equal(keysOf(session).length, 150_000);
});

// A row whose formulas of state stop contributing, while the lock stays.
test("Removing the last row contribution preserves each field state object whose state stays the same", () => {
  const session = createSession(
    defineForm({
      fields: { lock: field.checkbox({ default: true }) },
      collections: {
        lines: {
          fields: {
            a: field.number({ default: 1 }),
            b: field.number({ readOnly: true }),
            c: field.number(),
          },
        },
      },
      rules: {
        lines: {
          each: {
            a: {
              states: ({ a }) =>
                a === 1 ? { b: { readOnly: true }, c: { required: true } } : undefined,
            },
            // Redundant with the readOnly that b declares.
            b: { readOnly: ({ a }) => a === 2 },
          },
        },
      },
      form: { readOnly: { value: ({ lock }) => lock && "Locked" } },
    }),
    { initial: { lines: [{}] } },
  );
  const row = session.row("lines", keysOf(session)[0]);
  const first = row.getSnapshot().fieldStates;
  row.edit("a", 2);
  const second = row.getSnapshot().fieldStates;
  assert.deepEqual([second.b === first.b, second.b.reasons === first.b.reasons], [true, true]);
  assert.notEqual(second.c, first.c);
  // The redundant contribution leaves: nothing changes, not even the record.
  row.edit("a", 3);
  assert.equal(row.getSnapshot().fieldStates, second);
});

test("With 256 or more collections, an operation traverses every field and gives the same diagnostic", () => {
  const collections = Object.fromEntries(
    // From 512 collections on, a position would not fit in a number.
    Array.from({ length: 511 }, (_, index) => [`unused${index}`, { fields: {} }]),
  );
  collections.lines = { fields: { a: field.number(), b: field.number({ default: 0 }) } };
  const session = createSession(
    defineForm({
      fields: {},
      collections,
      rules: {
        lines: { each: { a: { value: ({ b }) => b + 1, onChange: ({ b }) => ({ a: b + 2 }) } } },
      },
    }),
    { initial: { lines: [{}] } },
  );
  const [key] = keysOf(session);
  rejects(
    session,
    () => session.row("lines", key).edit("a", 0),
    `Field "a" of "lines" row "${key}" onChange: cyclic dependency lines["${key}"].a → lines["${key}"].a.onChange → lines["${key}"].a`,
  );
});
