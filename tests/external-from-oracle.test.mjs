import assert from "node:assert/strict";
import { test } from "node:test";
import { open, operationOf, placesOf, published, run } from "./helpers/external-oracle.mjs";
import { random } from "./helpers/session.mjs";

// An oracle of from: it leaves out a destination exactly when an operation
// after the prepared would have withdrawn its messages. Two sessions run the
// same random operations. One receives the messages when it prepares, without
// from, and the operations withdraw them; the other, after the operations,
// with from. Both must publish the same in every scope.
const steps = (next, session, count) => {
  for (let step = 0; step < count; step++)
    run(session, operationOf(next, session.getSnapshot().rows.lines.length));
};
// Fills what the form requires, so that it prepares.
const valid = (session) => {
  session.edit("b", "s");
  for (const key of session.getSnapshot().rows.lines) session.row("lines", key).edit("y", "s");
};
// The places of a list, with the keys of this session at those positions.
const keyed = (places, keys) =>
  places.map(({ key, ...place }) => (key === undefined ? place : { ...place, key: keys[key] }));

// How many destinations of a result have some message.
const count = ({ form }) => form.counts[0] + form.counts[1];

const compare = async (seed) => {
  const early = open();
  const late = open();
  for (const session of [early, late]) {
    steps(random(seed), session, 6);
    valid(session);
  }
  const sent = await late.prepare();
  assert.equal(sent.status, "ready", `seed ${seed}`);
  // The lists name the rows by position, for both sessions.
  const next = random(seed + 1000);
  const positions = sent.rows.lines.map((_, index) => index);
  const errors = placesOf(next, positions, 10);
  const warnings = placesOf(next, positions, 6);
  early.setErrors("server", keyed(errors, early.getSnapshot().rows.lines));
  early.setWarnings("server", keyed(warnings, early.getSnapshot().rows.lines));
  for (const session of [early, late]) steps(random(seed + 2000), session, 8);
  assert.equal(late.setErrors("server", keyed(errors, sent.rows.lines), { from: sent }), true);
  assert.equal(late.setWarnings("server", keyed(warnings, sent.rows.lines), { from: sent }), true);
  assert.deepEqual(published(late), published(early), `seed ${seed}`);
  return published(late);
};

test("from omits what the operations would have withdrawn across 200 random sequences", async () => {
  const results = await Promise.all(Array.from({ length: 200 }, (_, seed) => compare(seed + 1)));
  // The sequences leave messages in place, and withdraw some.
  assert.ok(results.some((result) => count(result) > 4));
  assert.ok(results.some((result) => result.rows.some((row) => row.externalErrors.length > 0)));
  assert.ok(
    results.some((result) => result.rows.some((row) => row.cells.y.externalErrors.length > 0)),
  );
});
