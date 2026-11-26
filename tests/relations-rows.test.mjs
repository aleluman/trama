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
import { checkStep, exchange, exchangeFields, pair, pairOf } from "./helpers/relations.mjs";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";
import { heard } from "./helpers/session.mjs";

const rowForm = defineForm({
  fields: { tick: field.number({ default: 0 }) },
  collections: { lines: { fields: exchangeFields } },
  rules: { lines: { each: { driver: exchange } } },
});

test("a nested patch activates only the derived member of the row it writes, even if it repeats the value", () => {
  const initial = { driver: "rate", rate: 150, local: 777 };
  const session = createSession(rowForm, { initial: { lines: [initial, initial] } });
  const [a, b] = session.getSnapshot().rows.lines;
  const step = checkStep(session, (handle) => handle.getSnapshot().values.lines.map(pairOf));
  step(
    () => session.patch({ lines: { [a]: initial } }),
    [
      ["rate", 150, 777],
      ["rate", 150, 777],
    ],
  );
  step(
    () => session.patch({ tick: 1, lines: { [a]: { local: 777 } } }),
    [
      ["rate", 150, 15000],
      ["rate", 150, 777],
    ],
  );
  step(
    () => session.patch({ lines: { [b]: { driver: "rate", rate: 150, local: 778 } } }),
    [
      ["rate", 150, 15000],
      ["rate", 150, 15000],
    ],
  );
});

test("add preserves a complete pair and calculates the missing member of a partial pair", () => {
  const session = createSession(rowForm);
  const step = checkStep(session, (handle) => handle.getSnapshot().values.lines.map(pairOf));
  step(
    () =>
      session.add("lines", [
        { driver: "rate", rate: 150, local: 777 },
        { driver: "local", local: 777 },
        { rate: 150 },
      ]),
    [
      ["rate", 150, 777],
      ["local", 8, 777],
      ["", 150, 15000],
    ],
  );
});

const rates = { "USD:2026-11-23": 150, "USD:2026-11-24": 152, "EUR:2026-11-25": 170 };
const endpoints = defineEndpoints({
  exchangeRate: endpoint.value((_, { date, currency }) =>
    Promise.resolve(rates[`${currency}:${date}`]),
  ),
});
const bank = createForms({ endpoints: [endpoints] });
const receipt = bank.defineForm({
  fields: { date: field.date({ default: "2026-11-23" }), side: field.text({ default: "debit" }) },
  collections: {
    lines: {
      fields: {
        foreign: exchangeFields.foreign,
        driver: exchangeFields.driver,
        currency: exchangeFields.currency,
        rate: field.number(),
        local: exchangeFields.local,
        debit: field.number(),
        credit: field.number(),
      },
    },
  },
  rules: {
    lines: {
      each: {
        currency: { onChange: () => ({ driver: "" }) },
        rate: {
          query: {
            endpoint: "exchangeRate",
            params: ({ driver, currency }, { values: { date } }) =>
              driver === "" && currency !== "" && date !== null ? { currency, date } : undefined,
          },
        },
        driver: exchange,
        debit: { value: ({ local }, { values }) => (values.side === "debit" ? (local ?? 0) : 0) },
        credit: { value: ({ local }, { values }) => (values.side === "credit" ? (local ?? 0) : 0) },
      },
    },
  },
});

const saved = { currency: "USD", driver: "rate", foreign: 100, rate: 148, local: 14800 };

test("a line requests its rate in automatic mode and switches drivers when each member is edited", async () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(receipt, { loader, scope: "test", initial: { lines: [saved] } });
  const published = heard(session);
  assert.equal(calls.length, 0);
  let key;
  const step = checkStep(session, (handle) => handle.getSnapshot().values.lines.map(pairOf));
  const change = (operation, expected) => step(operation, [["rate", 148, 14800], expected]);
  change(() => {
    [key] = session.add("lines", [{ currency: "USD" }]);
  }, ["", null, 0]);
  const line = session.row("lines", key);
  await answer(calls, published, line, 1, { date: "2026-11-23", currency: "USD" }, [
    "",
    150,
    15000,
  ]);
  change(() => session.edit("date", "2026-11-24"), ["", 150, 15000]);
  await answer(calls, published, line, 2, { date: "2026-11-24", currency: "USD" }, [
    "",
    152,
    15200,
  ]);
  change(() => line.edit("rate", 155), ["rate", 155, 15500]);
  change(() => session.edit("date", "2026-11-25"), ["rate", 155, 15500]);
  assert.equal(calls.length, 2);
  change(() => line.edit("local", 16000), ["local", 160, 16000]);
  change(() => line.edit("foreign", 200), ["local", 80, 16000]);
  change(() => line.edit("currency", "EUR"), ["", 80, 16000]);
  await answer(calls, published, line, 3, { date: "2026-11-25", currency: "EUR" }, [
    "",
    170,
    34000,
  ]);
});

async function answer(calls, published, line, count, params, expected) {
  assert.equal(calls.length, count);
  const last = calls.at(-1);
  assert.deepEqual(last.key[3], params);
  const before = published.length;
  await last.resolve();
  assert.equal(published.length - before, 1);
  assert.deepEqual(pair(line), expected);
  assert.deepEqual(published.at(-1).values.lines[0], { ...saved, debit: 14800, credit: 0 });
}

const firstLine = (session) => session.getSnapshot().values.lines[0];

test("the header side moves the amount from debit to credit without modifying the pair or querying", () => {
  const { loader, calls } = scriptedLoader();
  const session = createSession(receipt, { loader, scope: "test", initial: { lines: [saved] } });
  assert.deepEqual(firstLine(session), { ...saved, debit: 14800, credit: 0 });
  checkStep(session, firstLine)(() => session.edit("side", "credit"), {
    ...saved,
    debit: 0,
    credit: 14800,
  });
  assert.equal(calls.length, 0);
});
