import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { cell, externals, keys, lines, open, row } from "./helpers/external-rows.mjs";
import { scriptedLoader, settle } from "./helpers/scripted-loader.mjs";

// from in rows: a cell that changed after preparing leaves out its messages
// and the own ones of its row; a change of the rows of a collection, those of
// the collection; and a row that the prepared did not have, all of its own.
// The response of a query is a change as any other.
const everywhere = (session) => [
  cell(session, 0, "debit", "D0"),
  cell(session, 0, "memo", "M0"),
  row(session, 0, "R0"),
  cell(session, 1, "amount", "A1"),
  row(session, 1, "R1"),
  row(session, 2, "R2"),
  lines("L"),
  { collection: "taxes", message: "T" },
  { message: "F" },
];

test("A cell that changed after preparing leaves out its messages and its row's own messages", async () => {
  const session = open();
  const sent = await session.prepare();
  const issues = everywhere(session);
  const first = session.row("lines", keys(session)[0]);
  first.edit("memo", "x");
  first.edit("memo", "");
  assert.equal(session.setErrors("server", issues, { from: sent }), true);
  assert.deepEqual(externals(session), {
    form: ["F"],
    lines: ["L"],
    "0.debit": ["D0"],
    "1.amount": ["A1"],
    1: ["R1"],
    2: ["R2"],
  });
  assert.deepEqual(session.getSnapshot().form.collections.taxes.externalErrors, ["T"]);
});

test("A formula that changed cells after preparing leaves out their messages and those of their rows", async () => {
  const session = open();
  const sent = await session.prepare();
  const issues = everywhere(session);
  session.edit("rate", 5);
  session.setErrors("server", issues, { from: sent });
  // The rate changed the amount of the rows with a debit: the first two.
  assert.deepEqual(externals(session), {
    form: ["F"],
    lines: ["L"],
    "0.debit": ["D0"],
    "0.memo": ["M0"],
    2: ["R2"],
  });
});

// Each change of the rows of the lines after preparing.
const structural = [
  (session) => session.add("lines", [{ debit: 1 }]),
  (session) => session.move("lines", keys(session)[0], 2),
  (session) => session.remove("lines", [keys(session)[2]]),
];
test("Adding, removing, or moving rows after preparing leaves out the collection's own messages", async () => {
  const checked = structural.map(async (change) => {
    const session = open();
    const sent = await session.prepare();
    const issues = everywhere(session);
    const [first] = keys(session);
    change(session);
    session.setErrors("server", issues, { from: sent });
    const { collections } = session.getSnapshot().form;
    assert.deepEqual(collections.lines.externalErrors, []);
    assert.deepEqual(collections.taxes.externalErrors, ["T"]);
    // The rows that stay take theirs, wherever they are now.
    assert.deepEqual(session.row("lines", first).getSnapshot().externalErrors, ["R0"]);
  });
  await Promise.all(checked);
});

test("A row removed after preparing is omitted, as is a row absent from the prepared submission", async () => {
  const session = open();
  const sent = await session.prepare();
  const issues = everywhere(session);
  session.remove("lines", [keys(session)[1]]);
  const [added] = session.add("lines", [{ debit: 1 }]);
  session.setErrors(
    "server",
    [
      ...issues,
      { collection: "lines", key: added, message: "New" },
      { collection: "lines", key: added, field: "memo", message: "New memo" },
    ],
    { from: sent },
  );
  assert.deepEqual(externals(session), {
    form: ["F"],
    "0.debit": ["D0"],
    "0.memo": ["M0"],
    0: ["R0"],
    1: ["R2"],
  });
  // Without from, the row of now is a destination.
  session.setErrors("server", [{ collection: "lines", key: added, message: "New" }]);
  assert.deepEqual(externals(session), { 2: ["New"] });
});

test("A row with no fields that was absent from the prepared submission is also omitted", async () => {
  const tagged = createSession(defineForm({ fields: {}, collections: { tags: { fields: {} } } }), {
    initial: { tags: [{}] },
  });
  const sent = await tagged.prepare();
  const [added] = tagged.add("tags", [{}]);
  const [first] = tagged.getSnapshot().rows.tags;
  tagged.setErrors(
    "server",
    [
      { collection: "tags", key: first, message: "Old" },
      { collection: "tags", key: added, message: "New" },
    ],
    { from: sent },
  );
  assert.deepEqual(tagged.row("tags", first).getSnapshot().externalErrors, ["Old"]);
  assert.deepEqual(tagged.row("tags", added).getSnapshot().externalErrors, []);
});

// A report whose rate a query writes, needed to prepare.
const server = defineEndpoints({
  rate: endpoint.value((_, { date }) => Promise.resolve(date === "2026-11-02" ? 150 : 144)),
});
const { defineForm, field } = createForms({ endpoints: [server] });
const quote = defineForm({
  fields: { date: field.date(), rate: field.number(), note: field.text() },
  rules: {
    rate: {
      query: {
        endpoint: "rate",
        params: ({ date }) => (date === null ? undefined : { date }),
        forPrepare: true,
      },
    },
  },
});
const quoting = () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(quote, { scope: "acme", loader, initial: { date: "2026-11-02" } });
  return { session, calls };
};
const rejected = [
  { field: "rate", message: "Rate rejected" },
  { field: "note", message: "Note rejected" },
];
const placed = (session) => {
  const { rate, note } = session.getSnapshot().fieldStates;
  return [rate.externalErrors, note.externalErrors];
};

test("Replacing external messages neither cancels a pending prepare nor requests any query", async () => {
  const { session, calls } = quoting();
  let outcome;
  void session.prepare().then((found) => (outcome = found));
  await settle();
  assert.equal(outcome, undefined);
  session.setErrors("server", rejected);
  session.setWarnings("server", rejected);
  await settle();
  assert.equal(outcome, undefined);
  assert.equal(calls.length, 1);
  await calls[0].resolve();
  assert.equal(outcome.status, "ready");
  // The response changed the rate: its externals left.
  assert.deepEqual(placed(session), [[], ["Note rejected"]]);
});

test("With from, messages are skipped for a target changed by a query response after prepare", async () => {
  const { session, calls } = quoting();
  await calls[0].resolve();
  const sent = await session.prepare();
  session.edit("date", "2026-11-03");
  await settle();
  session.setErrors("early", rejected, { from: sent });
  assert.deepEqual(placed(session), [["Rate rejected"], ["Note rejected"]]);
  await calls[1].resolve();
  assert.equal(session.getSnapshot().values.rate, 144);
  assert.deepEqual(placed(session), [[], ["Note rejected"]]);
  session.setErrors("late", rejected, { from: sent });
  assert.deepEqual(placed(session), [[], ["Note rejected"]]);
});
