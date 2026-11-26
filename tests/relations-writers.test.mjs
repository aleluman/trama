import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { checkStep, exchange, exchangeFields, openExchange, pair } from "./helpers/relations.mjs";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

test("another event preserves what it writes to the derived member unless the formula runs and takes precedence", () => {
  const tick = { onChange: () => ({ local: 888 }) };
  for (const [rules, expected] of [
    [{ tick, driver: exchange }, ["rate", 148, 14800]],
    [{ driver: exchange, tick }, ["rate", 148, 888]],
  ]) {
    const alone = openExchange(rules, { driver: "rate" });
    checkStep(alone)(() => alone.edit("tick", 1), ["rate", 150, 888]);

    const withRate = openExchange(rules, { driver: "rate" });
    checkStep(withRate)(() => withRate.patch({ tick: 1, rate: 148 }), expected);
  }
});

test("another event can set a member by also writing the driver", () => {
  const tick = { onChange: () => ({ local: 888, driver: "local" }) };
  for (const rules of [
    { tick, driver: exchange },
    { driver: exchange, tick },
  ]) {
    const session = openExchange(rules, { driver: "rate" });
    checkStep(session)(() => session.edit("tick", 1), ["local", 9, 888]);
  }
});

test("a later event can prevail even when the command activates the derived member by writing it", () => {
  const session = openExchange(
    { driver: exchange, tick: { onChange: () => ({ local: 888 }) } },
    { driver: "rate", rate: 150 },
  );
  checkStep(session)(
    () => session.patch({ driver: "rate", rate: 150, local: 777, tick: 1 }),
    ["rate", 150, 888],
  );
});

test("a formula that returns undefined preserves what the command wrote", () => {
  const session = openExchange(undefined, { foreign: 0, driver: "local", local: 777 });
  checkStep(session)(() => session.patch({ rate: 149, driver: "local" }), ["local", 149, 777]);
});

test("a current response can write the derived member without marking the driver", async () => {
  const endpoints = defineEndpoints({ quote: endpoint.value(() => Promise.resolve(888)) });
  const { defineForm } = createForms({ endpoints: [endpoints] });
  const definition = defineForm({
    fields: exchangeFields,
    rules: { driver: exchange, local: { query: { endpoint: "quote" } } },
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(definition, { initial: { driver: "rate" }, loader, scope: "test" });
  const published = [];
  session.subscribe(() => published.push(pair(session)));
  assert.deepEqual(pair(session), ["rate", 150, 15000]);
  assert.equal(calls.length, 1);
  await calls[0].resolve();
  assert.deepEqual(pair(session), ["rate", 150, 888]);
  assert.deepEqual(published, [["rate", 150, 888]]);
  checkStep(session)(() => session.edit("foreign", 200), ["rate", 150, 30000]);
});

test("a response or canonical patch that also changes the base yields to the formula in either order", async () => {
  const endpoints = defineEndpoints({ update: endpoint.value(() => Promise.resolve(888)) });
  const { defineForm } = createForms({ endpoints: [endpoints] });
  const query = { query: { endpoint: "update", patch: (local) => ({ local, foreign: 200 }) } };
  const opened = [
    { driver: exchange, local: query },
    { local: query, driver: exchange },
  ].map((rules, index) => {
    const { loader, calls } = scriptedLoader();
    const definition = defineForm({ fields: exchangeFields, rules });
    const options = { initial: { driver: "rate" }, loader, scope: `test${index}` };
    return { session: createSession(definition, options), calls };
  });
  await Promise.all(opened.map(({ calls }) => calls[0].resolve()));
  for (const { session } of opened) assert.deepEqual(pair(session), ["rate", 150, 30000]);
  const session = openExchange(undefined, { driver: "rate" });
  const prepared = await session.prepare();
  assert.equal(session.commit(prepared, { local: 888, foreign: 200 }), true);
  assert.deepEqual(pair(session), ["rate", 150, 30000]);
  session.reset();
  assert.deepEqual(pair(session), ["rate", 150, 30000]);
});
