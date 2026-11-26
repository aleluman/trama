import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

test("a line requests its rate in automatic mode, and a response does not activate manual mode", async () => {
  const endpoints = defineEndpoints({
    rate: endpoint.value((_, { currency }) => Promise.resolve(currency === "MXN" ? 150 : 170)),
  });
  const { defineForm, field } = createForms({ endpoints: [endpoints] });
  const form = defineForm({
    fields: { date: field.text({ default: "2026-11-23" }) },
    collections: {
      lines: {
        fields: { currency: field.text(), rate: field.number(), rateManual: field.checkbox() },
      },
    },
    rules: {
      lines: {
        each: {
          currency: { onChange: () => ({ rateManual: false }) },
          rate: {
            onEdit: () => ({ rateManual: true }),
            query: {
              endpoint: "rate",
              params: ({ currency, rateManual }, { values: { date } }) =>
                !currency || rateManual ? undefined : { currency, date },
            },
          },
        },
      },
    },
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(form, { loader, scope: "test" });
  const [key] = session.add("lines", [{ currency: "MXN" }]);
  const line = session.row("lines", key);
  assert.equal(calls.length, 1);
  await calls[0].resolve();
  assert.deepEqual(line.getSnapshot().values, { currency: "MXN", rate: 150, rateManual: false });
  session.edit("date", "2026-11-24");
  assert.equal(calls.length, 2);
  line.edit("rate", 155);
  session.edit("date", "2026-11-25");
  assert.equal(calls.length, 2);
  assert.deepEqual(line.getSnapshot().values, { currency: "MXN", rate: 155, rateManual: true });
  line.edit("currency", "EUR");
  assert.equal(calls.length, 3);
  await calls[2].resolve();
  assert.deepEqual(line.getSnapshot().values, { currency: "EUR", rate: 170, rateManual: false });
});
