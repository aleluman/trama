import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
} from "trama-forms/core";
import { rejects, states } from "./helpers/session.mjs";

const dirtyOf = (session) =>
  Object.fromEntries(
    Object.entries(states(session)).map(([name, state]) => [
      name,
      Array.isArray(state)
        ? state.map((row) => dirtyOf({ getSnapshot: () => ({ fieldStates: row }) }))
        : state.dirty,
    ]),
  );

test("opening with saved data leaves the form clean, editing makes it dirty, and returning to the original value clears it", () => {
  const session = createSession(
    defineForm({
      fields: { title: field.text(), amount: field.number(), total: field.number() },
      rules: { total: { value: ({ amount }) => (amount ?? 0) * 2 } },
    }),
    { initial: { title: "Saved", amount: 3 } },
  );
  assert.deepEqual(dirtyOf(session), { title: false, amount: false, total: false });
  session.edit("title", "Other");
  assert.deepEqual(dirtyOf(session), { title: true, amount: false, total: false });
  session.edit("amount", 4);
  assert.deepEqual(
    dirtyOf(session),
    { title: true, amount: true, total: true },
    "A formula does too",
  );
  session.edit("title", "Saved");
  session.edit("amount", 3);
  assert.deepEqual(dirtyOf(session), { title: false, amount: false, total: false });
  session.edit("title", "Other");
  session.reset();
  assert.deepEqual(dirtyOf(session), { title: false, amount: false, total: false });
});

test("a reordered multi-select value and an option with the same value leave the form clean", () => {
  const catalog = defineEndpoints({
    people: endpoint.list(() => Promise.resolve([{ value: 1, label: "Ana" }])),
  });
  const forms = createForms({ endpoints: [catalog] });
  const session = createSession(
    forms.defineForm({
      fields: {
        kinds: forms.field.multiSelect({
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        }),
        person: forms.field.async("people"),
        team: forms.field.multiAsync("people"),
      },
    }),
    {
      scope: 1,
      initial: {
        kinds: ["a", "b"],
        person: { value: 1, label: "Ana" },
        team: [{ value: 1, label: "Ana" }],
      },
    },
  );
  session.edit("kinds", ["b"]);
  assert.equal(states(session).kinds.dirty, true);
  session.edit("kinds", ["b", "a"]);
  assert.equal(states(session).kinds.dirty, false);
  session.edit("person", null);
  session.edit("person", { value: 1, label: "Ana Marie" });
  assert.equal(states(session).person.dirty, false);
  session.edit("team", []);
  session.edit("team", [{ value: 1, label: "Different" }]);
  assert.equal(states(session).team.dirty, false);
});

test("the cells of a new row are dirty, and the cells of a saved row are dirty only when changed", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: { lines: { fields: { quantity: field.number(), note: field.text() } } },
    }),
    { initial: { lines: [{ quantity: 1 }] } },
  );
  const [saved] = session.getSnapshot().rows.lines;
  assert.deepEqual(dirtyOf(session).lines, [{ quantity: false, note: false }]);
  session.row("lines", saved).edit("quantity", 2);
  const [added] = session.add("lines", [{}]);
  assert.deepEqual(dirtyOf(session).lines, [
    { quantity: true, note: false },
    { quantity: true, note: true },
  ]);
  session.row("lines", saved).edit("quantity", 1);
  session.move("lines", added, 0);
  assert.deepEqual(dirtyOf(session).lines, [
    { quantity: true, note: true },
    { quantity: false, note: false },
  ]);
  session.reset();
  assert.deepEqual(dirtyOf(session).lines, [{ quantity: false, note: false }]);
});

test("a rejected operation leaves all state unchanged", () => {
  const session = createSession(
    defineForm({
      fields: { note: field.text(), limit: field.number() },
      collections: { lines: { fields: { price: field.number({ max: 10 }) } } },
      rules: { lines: { each: { price: { min: (_, { values }) => values.limit ?? undefined } } } },
    }),
    { initial: { lines: [{ price: 5 }] } },
  );
  session.edit("note", "x");
  session.edit("note", "");
  rejects(
    session,
    () => session.patch({ note: "y", limit: 20 }),
    'Field "price" of "lines" row "' +
      session.getSnapshot().rows.lines[0] +
      '" (number): min 20 exceeds max 10',
  );
  assert.equal(states(session).note.dirty, false);
});
