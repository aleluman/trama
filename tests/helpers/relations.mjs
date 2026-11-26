import assert from "node:assert/strict";
import { createSession, defineForm, field } from "trama-forms/core";

export const exchangeFields = {
  foreign: field.number({ default: 100 }),
  rate: field.number({ default: 150 }),
  local: field.number(),
  driver: field.text(),
  tick: field.number({ default: 0 }),
  currency: field.text(),
};

export const exchangeMembers = {
  rate: ({ foreign, local }) => (foreign ? Math.round(local / foreign) : undefined),
  local: ({ foreign, rate }) => Math.round(foreign * rate),
};
export const exchange = { relation: { default: "rate", members: exchangeMembers } };

const exchangeRules = { driver: exchange };
export const openExchange = (rules = exchangeRules, initial) =>
  createSession(defineForm({ fields: exchangeFields, rules }), { initial });

export const pairOf = ({ driver, rate, local }) => [driver, rate, local];
export const pair = (handle) => pairOf(handle.getSnapshot().values);

export const checkStep = (session, check = pair) => {
  let publications = 0;
  session.subscribe(() => publications++);
  return (operation, expected, count = 1) => {
    const before = publications;
    operation();
    assert.deepEqual(check(session), expected);
    assert.equal(publications - before, count);
  };
};
