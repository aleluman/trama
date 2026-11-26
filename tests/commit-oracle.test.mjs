import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { pick, random } from "./helpers/session.mjs";

// An oracle of commit: random sequences of edits, rows added, removed and
// moved, prepares, commits with canonical values, stale commits and resets,
// over a form without rules, so the baseline is exactly the prepared with its
// canonical values. After each step it compares dirty in every scope with the
// values and the baseline it keeps, and after a reset, the values with it.
const form = defineForm({
  fields: {
    a: field.number(),
    b: field.text(),
    tags: field.multiSelect({
      options: [
        { value: "p", label: "P" },
        { value: "q", label: "Q" },
      ],
    }),
  },
  collections: { lines: { fields: { x: field.number(), y: field.text() } } },
});
const header = ["a", "b", "tags"];
const cells = ["x", "y"];
const sameTags = (left, right) =>
  left.length === right.length && left.every((tag) => right.includes(tag));
const equal = (name, left, right) => (name === "tags" ? sameTags(left, right) : left === right);

const valueOf = (next, name) =>
  name === "tags"
    ? pick(next, [[], ["p"], ["q"], ["p", "q"], ["q", "p"]])
    : name === "a" || name === "x"
      ? pick(next, [null, 1, 2])
      : pick(next, ["", "s", "t"]);

// The model: the baseline, what changed after each live prepared, the epoch
// and the last sequence accepted.
const modelOf = (session) => {
  const { values, rows } = session.getSnapshot();
  return {
    baseline: snapshotOf(values, rows),
    prepared: [],
    epoch: 0,
    seq: 0,
    accepted: 0,
  };
};
const snapshotOf = (values, rows) => ({
  header: Object.fromEntries(header.map((name) => [name, values[name]])),
  order: [...rows.lines],
  records: new Map(rows.lines.map((key, at) => [key, { ...values.lines[at] }])),
});
const live = (session) => {
  const { values, rows } = session.getSnapshot();
  return snapshotOf(values, rows);
};
// Records what an operation changed in every prepared still alive.
const changes = (model, before, after) => {
  const changed = [];
  for (const name of header) if (before.header[name] !== after.header[name]) changed.push(name);
  for (const [key, record] of after.records)
    for (const name of cells)
      if (before.records.get(key)?.[name] !== record[name]) changed.push(`${key}.${name}`);
  for (const prepared of model.prepared) for (const address of changed) prepared.after.add(address);
};

const check = (session, model) => {
  const now = live(session);
  const { fieldStates, form: state } = session.getSnapshot();
  let dirty = false;
  for (const name of header) {
    const expected = !equal(name, now.header[name], model.baseline.header[name]);
    assert.equal(fieldStates[name].dirty, expected, `header ${name}`);
    dirty ||= expected;
  }
  let lines = now.order.join() !== model.baseline.order.join();
  for (const key of now.order) {
    const saved = model.baseline.records.get(key);
    const snapshot = session.row("lines", key).getSnapshot();
    let row = saved === undefined;
    for (const name of cells) {
      const expected = saved === undefined || saved[name] !== now.records.get(key)[name];
      assert.equal(snapshot.fieldStates[name].dirty, expected, `${key}.${name}`);
      row ||= expected;
    }
    assert.equal(snapshot.dirty, row, `row ${key}`);
    lines ||= row;
  }
  assert.equal(state.collections.lines.dirty, lines, "lines");
  assert.equal(state.dirty, dirty || lines, "form");
};

// One random step; prepare and commit return a promise.
const step = (session, model, next) => {
  const before = live(session);
  const keys = before.order;
  const choice = next();
  if (choice < 0.25) {
    const name = pick(next, header);
    session.edit(name, valueOf(next, name));
  } else if (choice < 0.45 && keys.length > 0) {
    const name = pick(next, cells);
    session.row("lines", pick(next, keys)).edit(name, valueOf(next, name));
  } else if (choice < 0.5) session.add("lines", [{ x: valueOf(next, "x") }]);
  else if (choice < 0.55 && keys.length > 0) session.remove("lines", [pick(next, keys)]);
  else if (choice < 0.6 && keys.length > 1)
    session.move("lines", pick(next, keys), Math.floor(next() * keys.length));
  else if (choice < 0.72) return prepareStep(session, model);
  else if (choice < 0.9) return commitStep(session, model, next);
  else if (choice < 0.95) resetStep(session, model);
  changes(model, before, live(session));
};
const prepareStep = async (session, model) => {
  const outcome = await session.prepare();
  assert.equal(outcome.status, "ready");
  model.prepared.push({ outcome, epoch: model.epoch, seq: ++model.seq, after: new Set() });
};
const commitStep = (session, model, next) => {
  const prepared = model.prepared.length === 0 ? undefined : pick(next, model.prepared);
  if (prepared === undefined) return;
  const { values, rows } = prepared.outcome;
  const canonical = {};
  for (const name of header) if (next() < 0.3) canonical[name] = valueOf(next, name);
  const rowsPatch = {};
  for (const key of rows.lines)
    if (next() < 0.3) {
      const name = pick(next, cells);
      rowsPatch[key] = { [name]: valueOf(next, name) };
    }
  if (Object.keys(rowsPatch).length > 0) canonical.lines = rowsPatch;
  const fresh = prepared.epoch === model.epoch && prepared.seq > model.accepted;
  const before = live(session);
  assert.equal(session.commit(prepared.outcome, canonical), fresh);
  if (!fresh) return;
  model.accepted = prepared.seq;
  const saved = snapshotOf(values, rows);
  for (const name of header) if (name in canonical) saved.header[name] = canonical[name];
  for (const [key, patch] of Object.entries(rowsPatch))
    Object.assign(saved.records.get(key), patch);
  model.baseline = saved;
  // The values in force took the canonical values where nothing changed after.
  const expected = live(session);
  for (const name of header)
    if (name in canonical && !prepared.after.has(name))
      assert.ok(equal(name, expected.header[name], canonical[name]), `live ${name}`);
  for (const [key, patch] of Object.entries(rowsPatch))
    for (const [name, value] of Object.entries(patch))
      if (before.records.has(key) && !prepared.after.has(`${key}.${name}`))
        assert.equal(expected.records.get(key)[name], value, `live ${key}.${name}`);
  // What a commit writes is of the server: it is no change after another prepared.
};
const resetStep = (session, model) => {
  session.reset();
  model.epoch += 1;
  const now = live(session);
  for (const name of header)
    assert.ok(equal(name, now.header[name], model.baseline.header[name]), `reset ${name}`);
  assert.deepEqual(now.order, model.baseline.order);
  for (const key of now.order)
    assert.deepEqual(now.records.get(key), model.baseline.records.get(key));
};

const run = async (session, model, next, left) => {
  if (left === 0) return;
  await step(session, model, next);
  check(session, model);
  await run(session, model, next, left - 1);
};

for (const seed of Array.from({ length: 30 }, (_, index) => index + 1))
  test(`commit, dirty, and reset match the model for sequence ${seed}`, async () => {
    const session = createSession(form, {
      initial: { a: 1, b: "s", tags: ["p"], lines: [{ x: 1, y: "s" }, { x: 2 }] },
    });
    const model = modelOf(session);
    await run(session, model, random(seed), 80);
  });
