import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStep, openExchange, pair } from "./helpers/relations.mjs";

const settled = (session) => [...pair(session), session.getSnapshot().form.dirty];

test("the canonical value preserves the later edit to the local amount in the live state, and reset publishes the baseline", async () => {
  const session = openExchange();
  const sent = await session.prepare();
  const step = checkStep(session, settled);
  step(() => session.edit("local", 14600), ["local", 146, 14600, true]);
  step(
    () => assert.equal(session.commit(sent, { foreign: 200, driver: "rate", rate: 150 }), true),
    ["local", 73, 14600, true],
  );
  assert.equal(session.getSnapshot().values.foreign, 200);
  step(() => session.reset(), ["rate", 150, 30000, false]);
  assert.equal(session.getSnapshot().values.foreign, 200);
});

test("the rounded former driver derives again before receiving the canonical value", async () => {
  const session = openExchange(undefined, { driver: "rate", rate: 150 });
  const sent = await session.prepare();
  const step = checkStep(session, settled);
  step(() => session.edit("rate", 144), ["rate", 144, 14400, true]);
  step(() => session.edit("local", 14401), ["local", 144, 14401, true]);
  step(
    () => assert.equal(session.commit(sent, { foreign: 200 }), true),
    ["local", 72, 14401, true],
  );
  step(() => session.reset(), ["rate", 150, 30000, false]);
});

test("the rate onEdit protects the driver it repeated, and only the baseline takes the canonical value", async () => {
  const session = openExchange(undefined, { driver: "rate", rate: 150 });
  const sent = await session.prepare();
  const step = checkStep(session, settled);
  step(() => session.edit("rate", 144), ["rate", 144, 14400, true]);
  step(
    () => assert.equal(session.commit(sent, { foreign: 200, driver: "local" }), true),
    ["rate", 144, 28800, true],
  );
  step(() => session.reset(), ["local", 75, 15000, false]);
});

test("the canonical value can preserve an inconsistent derived member without changing the driver", async () => {
  const session = openExchange(undefined, { driver: "rate" });
  const sent = await session.prepare();
  const step = checkStep(session, settled);
  step(() => assert.equal(session.commit(sent, { local: 888 }), true), ["rate", 150, 888, false]);
  step(() => session.edit("foreign", 200), ["rate", 150, 30000, true]);
  step(() => session.reset(), ["rate", 150, 888, false]);
});
