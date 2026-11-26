import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { checkStep, exchange, exchangeMembers, openExchange } from "./helpers/relations.mjs";

test("the discount switches drivers, rounds the amount, and returns to the percentage with null", () => {
  const session = createSession(
    defineForm({
      fields: {
        gross: field.number({ default: 1000 }),
        percent: field.number({ default: 10 }),
        amount: field.number(),
        discountBy: field.select({
          options: [
            { value: "percent", label: "Percentage" },
            { value: "amount", label: "Amount" },
          ],
        }),
      },
      rules: {
        discountBy: {
          relation: {
            default: "percent",
            members: {
              percent: ({ gross, amount }) => (gross ? ((amount ?? 0) / gross) * 100 : undefined),
              amount: ({ gross, percent }) => Math.round(((gross ?? 0) * (percent ?? 0)) / 100),
            },
          },
        },
      },
    }),
  );
  let published = 0;
  session.subscribe(() => published++);
  const values = (gross, percent, amount, discountBy) =>
    assert.deepEqual(session.getSnapshot().values, { gross, percent, amount, discountBy });
  values(1000, 10, 100, null);
  session.edit("percent", 12.345);
  values(1000, 12.345, 123, "percent");
  session.edit("amount", 150);
  values(1000, 15, 150, "amount");
  session.edit("gross", 0);
  values(0, 15, 150, "amount");
  session.edit("discountBy", null);
  values(0, 15, 0, null);
  assert.equal(published, 4);
});

test("the base preserves the current driver unless its onEdit chooses the rate", () => {
  for (const [foreign, expected] of [
    [undefined, ["local", 80, 16000]],
    [{ onEdit: () => ({ driver: "rate" }) }, ["rate", 160, 32000]],
  ]) {
    const session = openExchange({ driver: exchange, foreign });
    const step = checkStep(session);
    step(() => session.edit("local", 16000), ["local", 160, 16000]);
    step(() => session.edit("foreign", 200), expected);
  }
});

test("the default member breaks ties in both orders and respects the explicit driver", () => {
  const { rate, local } = exchangeMembers;
  for (const members of [
    { rate, local },
    { local, rate },
  ]) {
    for (const [driverPatch, expected] of [
      [{}, "rate"],
      [{ driver: "rate" }, "rate"],
      [{ driver: "" }, ""],
    ]) {
      const session = openExchange({ driver: { relation: { default: "rate", members } } });
      checkStep(session)(
        () => session.patch({ rate: 148, local: 777, ...driverPatch }),
        [expected, 148, 14800],
      );
    }
  }
});

const pairBeforeDriver = {
  rate: ({ local, driver, foreign }) =>
    driver === "local" ? Math.round(local / foreign) : undefined,
  local: ({ rate, driver, foreign }) => (driver === "rate" ? rate * foreign : undefined),
};

test("switching drivers removes the previous dependency when switching back, in both orders", () => {
  const { rate, local } = pairBeforeDriver;
  for (const members of [
    { rate, local },
    { local, rate },
  ]) {
    const session = openExchange(
      { driver: { relation: { default: "rate", members } } },
      { driver: "rate", rate: 150, local: 15000 },
    );
    const step = checkStep(session);
    // The local formula settles before its event reveals the new driver.
    step(() => session.patch({ foreign: 200, local: 14000 }), ["local", 70, 14000]);
    step(() => session.edit("foreign", 100), ["local", 140, 14000]);
  }
});

test("general precedence lets other events choose the final driver", () => {
  const sessions = [
    [
      openExchange({ driver: exchange, currency: { onChange: () => ({ driver: "" }) } }),
      { currency: "MXN", driver: "local", rate: 148, local: 777 },
      ["", 148, 14800],
    ],
    [
      openExchange({ driver: exchange, foreign: { onEdit: () => ({ driver: "local" }) } }),
      { foreign: 200, rate: 148, local: 16000 },
      ["local", 80, 16000],
    ],
  ];
  for (const [session, patch, expected] of sessions)
    checkStep(session)(() => session.patch(patch), expected);
});

test("the derived member recalculates if the command writes it and the pass has differences", () => {
  const session = openExchange(undefined, { driver: "rate", rate: 150 });
  checkStep(session)(
    () => session.patch({ driver: "rate", rate: 150, local: 777 }),
    ["rate", 150, 15000],
  );

  const initial = { driver: "rate", rate: 150, local: 777 };
  const supplied = openExchange(undefined, initial);
  const step = checkStep(supplied);
  step(() => supplied.patch(initial), ["rate", 150, 777]);
  step(() => supplied.patch({ local: 777, tick: 1 }), ["rate", 150, 15000]);
});

test("only the relation formulas activate when a write to a target is repeated", () => {
  const session = openExchange(
    { driver: exchange, currency: { value: () => "MXN" } },
    { driver: "rate", rate: 170, local: 777, currency: "EUR" },
  );
  checkStep(session, (handle) => handle.getSnapshot().values)(
    () => session.patch({ currency: "EUR", local: 777, tick: 1 }),
    {
      foreign: 100,
      driver: "rate",
      rate: 170,
      local: 17000,
      currency: "EUR",
      tick: 1,
    },
  );
});
