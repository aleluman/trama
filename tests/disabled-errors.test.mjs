import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { failsAt, rejects } from "./helpers/session.mjs";

const orderFields = () => ({
  customer: field.text(),
  includeNote: field.checkbox({ default: true }),
  confirmed: field.checkbox(),
  note: field.text({ default: "Leave with the concierge" }),
});

test("a throwing contribution rejects opening, editing, and reset without publishing or losing contributions", () => {
  const boom = new Error("State unavailable");
  let broken = false;
  const order = defineForm({
    fields: orderFields(),
    rules: {
      note: {
        disabled: [
          ({ includeNote }) => !includeNote,
          ({ customer }) => {
            if (broken || customer === "Failure") throw boom;
            return false;
          },
        ],
      },
    },
  });
  const message = 'Field "note" disabled[1]: formula failed: State unavailable';
  for (const initial of [{ customer: "Failure" }, { customer: "Failure", includeNote: false }])
    assert.throws(() => createSession(order, { initial }), { message, cause: boom });
  const session = createSession(order, { initial: { includeNote: false } });
  rejects(session, () => session.edit("customer", "Failure"), message, boom);
  assert.equal(session.getSnapshot().values.customer, "");
  session.edit("includeNote", true);
  assert.equal(
    session.getSnapshot().fieldStates.note.disabled,
    false,
    "The previous contribution was still in effect",
  );
  broken = true;
  rejects(session, () => session.reset(), message, boom);
  broken = false;
  session.reset();
  assert.equal(session.getSnapshot().fieldStates.note.disabled, true);
});

test("a result outside the allowed boolean, non-empty reason, or undefined rejects the operation and names the contribution", () => {
  for (const [result, text] of [
    [null, "null"],
    ["", '""'],
    [1, "1"],
    [0, "0"],
    [Promise.resolve(true), "[object Promise]"],
    [{ disabled: true }, "[object Object]"],
  ]) {
    const order = defineForm({
      fields: orderFields(),
      rules: {
        note: { disabled: ({ customer }) => (customer === "Ana" ? result : false) },
        confirmed: {
          disabled: [() => false, ({ customer }) => (customer === "Ana" ? result : true)],
        },
      },
    });
    const session = createSession(order);
    rejects(
      session,
      () => session.edit("customer", "Ana"),
      `Field "note" disabled: incompatible result ${text}, expected a boolean, a non-empty reason or undefined`,
    );
    assert.throws(() => createSession(order, { initial: { customer: "Ana" } }), {
      message: `Field "note" disabled: incompatible result ${text}, expected a boolean, a non-empty reason or undefined`,
    });
    const reordered = defineForm({
      fields: orderFields(),
      rules: {
        confirmed: {
          disabled: [() => false, ({ customer }) => (customer === "Ana" ? result : true)],
        },
      },
    });
    assert.throws(() => createSession(reordered, { initial: { customer: "Ana" } }), {
      message: `Field "confirmed" disabled[1]: incompatible result ${text}, expected a boolean, a non-empty reason or undefined`,
    });
  }
});

test("values and peek are read-only in disabled", () => {
  for (const [contribution, label] of [
    [
      (values) => {
        values.note = "";
        return true;
      },
      "disabled",
    ],
    [
      [
        () => false,
        (_, { peek }) => {
          delete peek.note;
          return true;
        },
      ],
      "disabled[1]",
    ],
  ]) {
    const order = defineForm({
      fields: orderFields(),
      rules: { note: { disabled: contribution } },
    });
    assert.throws(
      () => createSession(order),
      (error) =>
        error.message === `Field "note" ${label}: formula failed: Formula values are readonly` &&
        error.cause instanceof TypeError,
    );
  }
});

test("value or event failures are reported before disabled failures, and the first declared contribution wins among contributions", () => {
  const order = defineForm({
    fields: {
      source: field.number(),
      total: field.number(),
      log: field.text(),
      note: field.text(),
    },
    rules: {
      log: { disabled: failsAt(4, "log", false) },
      note: {
        disabled: [
          failsAt(1, "first", false),
          ({ source }) => {
            if ((source ?? 0) > 0) throw new Error("second");
            return false;
          },
        ],
      },
      total: { value: failsAt(2, "value") },
      source: { onChange: failsAt(3, "event") },
    },
  });
  const session = createSession(order);
  rejects(
    session,
    () => session.edit("source", 1),
    'Field "note" disabled[0]: formula failed: first',
  );
  rejects(session, () => session.edit("source", 2), 'Field "total" value: formula failed: value');
  rejects(session, () => session.edit("source", 3), 'Field "source" onChange: event failed: event');
  rejects(session, () => session.edit("source", 4), 'Field "log" disabled: formula failed: log');
});

test("at runtime, defineForm rejects disabled that is neither a formula nor an array of formulas", () => {
  const holes = [() => true];
  holes[2] = () => false;
  for (const [disabled, message] of [
    [true, 'Field "note" disabled: expected a formula or an array of formulas'],
    [null, 'Field "note" disabled: expected a formula or an array of formulas'],
    ["confirmed", 'Field "note" disabled: expected a formula or an array of formulas'],
    [new Set([() => true]), 'Field "note" disabled: expected a formula or an array of formulas'],
    [
      { 0: () => true, length: 1 },
      'Field "note" disabled: expected a formula or an array of formulas',
    ],
    [[() => true, true], 'Field "note" disabled[1]: formula must be a function'],
    [[() => true, undefined], 'Field "note" disabled[1]: formula must be a function'],
    [holes, 'Field "note" disabled[1]: formula must be a function'],
    [[[() => true]], 'Field "note" disabled[0]: formula must be a function'],
  ])
    assert.throws(() => defineForm({ fields: orderFields(), rules: { note: { disabled } } }), {
      message,
    });
  for (const entry of [
    { disabled: undefined },
    { disabled: [] },
    { value: undefined, disabled: [] },
  ]) {
    const session = createSession(defineForm({ fields: orderFields(), rules: { note: entry } }));
    assert.equal(session.getSnapshot().fieldStates.note.disabled, false);
  }
});
