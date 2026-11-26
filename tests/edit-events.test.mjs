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
import { rejects } from "./helpers/session.mjs";

test("debit and credit clear each other on edit, but a patch preserves both", () => {
  const form = defineForm({
    fields: { credit: field.number(), debit: field.number() },
    rules: {
      debit: { onEdit: () => ({ debit: 777, credit: 0 }) },
      credit: { onEdit: () => ({ debit: 0 }) },
    },
  });
  const session = createSession(form, { initial: { credit: 20, debit: 0 } });
  session.edit("debit", 50);
  assert.deepEqual(session.getSnapshot().values, { credit: 0, debit: 50 });
  session.edit("credit", 20);
  assert.deepEqual(session.getSnapshot().values, { credit: 20, debit: 0 });
  session.patch({ debit: 50, credit: 20 });
  assert.deepEqual(session.getSnapshot().values, { credit: 20, debit: 50 });
});

test("onEdit reads and property descriptors see the direct edit rather than the formula's value", () => {
  const session = createSession(
    defineForm({
      fields: {
        source: field.number(),
        amount: field.number(),
        log: field.text(),
        settled: field.number(),
      },
      rules: {
        amount: {
          value: ({ source }) => source,
          onEdit: (values) => ({
            log: `${values.amount}:${Object.getOwnPropertyDescriptor(values, "amount").value}:${values.settled}`,
          }),
        },
        settled: { value: ({ amount }) => amount },
      },
    }),
  );
  session.patch({ amount: 5, source: 7 });
  assert.deepEqual(session.getSnapshot().values, {
    source: 7,
    amount: 7,
    log: "5:5:7",
    settled: 7,
  });
});

const saleWith = (rules) =>
  defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      price: field.number({ default: 10 }),
      total: field.number(),
      totalManual: field.checkbox(),
    },
    rules: {
      total: {
        value: ({ quantity, price, totalManual }) => (totalManual ? undefined : quantity * price),
        ...rules,
      },
    },
  });
const manual = () => ({ totalManual: true });
const sale = saleWith({ onEdit: manual });

test("an ordinary mode field keeps the override until it switches back to automatic", () => {
  const session = createSession(sale);
  session.edit("total", 25);
  session.patch({ quantity: 3, price: 9 });
  assert.deepEqual(session.getSnapshot().values, {
    total: 25,
    quantity: 3,
    price: 9,
    totalManual: true,
  });
  session.edit("totalManual", false);
  assert.equal(session.getSnapshot().values.total, 27);
  session.reset();
  assert.deepEqual(session.getSnapshot().values, {
    total: 20,
    quantity: 2,
    price: 10,
    totalManual: false,
  });
  const saved = createSession(sale, { initial: { total: 25, totalManual: true } });
  saved.edit("price", 11);
  assert.equal(saved.getSnapshot().values.total, 25);
});

test("an onEdit that repeats the mode protects the live value from the canonical value and lets the baseline take it", async () => {
  const session = createSession(sale, { initial: { total: 30, totalManual: true } });
  const sent = await session.prepare();
  session.edit("total", 40);
  assert.equal(session.commit(sent, { totalManual: false }), true);
  assert.equal(session.getSnapshot().form.dirty, true);
  assert.deepEqual(session.getSnapshot().values, {
    total: 40,
    quantity: 2,
    price: 10,
    totalManual: true,
  });
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 40);
  session.reset();
  assert.deepEqual(session.getSnapshot().values, {
    total: 20,
    quantity: 2,
    price: 10,
    totalManual: false,
  });
});

test("only command changes trigger onEdit; rules, opening, reset, and canonical values do not", async () => {
  const session = createSession(
    defineForm({
      fields: {
        driver: field.text(),
        debit: field.number(),
        credit: field.number({ default: 30 }),
      },
      rules: {
        driver: { onChange: () => ({ debit: 20 }) },
        debit: { onEdit: () => ({ credit: 0 }) },
      },
    }),
    { initial: { debit: 10 } },
  );
  const values = () => session.getSnapshot().values;
  assert.deepEqual(values(), { driver: "", debit: 10, credit: 30 });
  session.edit("debit", 10);
  assert.equal(values().credit, 30);
  session.edit("driver", "rule");
  assert.deepEqual(values(), { driver: "rule", debit: 20, credit: 30 });
  const sent = await session.prepare();
  session.commit(sent, { debit: 42 });
  assert.deepEqual(values(), { driver: "rule", debit: 42, credit: 30 });
  session.edit("debit", 50);
  assert.equal(values().credit, 0);
  session.reset();
  assert.deepEqual(values(), { driver: "rule", debit: 42, credit: 30 });
});

const accountParams = ({ note }) => (note === "request" ? {} : undefined);

test("a mixed patch distinguishes field equality from writes that repeat the current value", () => {
  const endpoints = defineEndpoints({ accounts: endpoint.list(() => Promise.resolve([])) });
  const forms = createForms({ endpoints: [endpoints] });
  const session = createSession(
    forms.defineForm({
      fields: {
        account: forms.field.async("accounts"),
        accounts: forms.field.multiAsync("accounts"),
        total: field.number(),
        totalManual: field.checkbox(),
        note: field.text(),
      },
      rules: {
        account: { params: accountParams, onEdit: () => ({ note: "account" }) },
        accounts: { params: accountParams, onEdit: () => ({ note: "accounts" }) },
        total: { onEdit: manual },
      },
    }),
    {
      scope: "test",
      initial: {
        account: { value: 1, label: "One" },
        accounts: [
          { value: 1, label: "One" },
          { value: 2, label: "Two" },
        ],
      },
    },
  );
  const { account, accounts } = session.getSnapshot().values;
  session.patch({
    account: { value: 1, label: "Another" },
    accounts: accounts.toReversed(),
    total: 25,
    totalManual: false,
  });
  const now = session.getSnapshot().values;
  assert.equal(now.account, account);
  assert.equal(now.accounts, accounts);
  assert.deepEqual(now, { account, accounts, total: 25, totalManual: false, note: "" });
  session.patch({ total: 25 });
  assert.equal(session.getSnapshot().values, now);
});

test("the canonical value from a later prepared submission applies, and from omits the rewritten mode", async () => {
  await Promise.all(
    [false, true].map(async (later) => {
      const session = createSession(sale, { initial: { total: 30, totalManual: true } });
      const first = await session.prepare();
      session.setWarnings("previous", [{ field: "totalManual", message: "Current" }]);
      session.edit("total", 40);
      const second = await session.prepare();
      const messages = [
        { field: "totalManual", message: "Mode" },
        { field: "quantity", message: "Quantity" },
      ];
      session.setErrors("server", messages, { from: first });
      session.setWarnings("server", messages, { from: first });
      const states = session.getSnapshot().fieldStates;
      assert.deepEqual(states.totalManual.externalErrors, []);
      assert.deepEqual(states.totalManual.warnings, ["Current"]);
      assert.deepEqual(states.quantity.externalErrors, ["Quantity"]);
      assert.deepEqual(states.quantity.warnings, ["Quantity"]);
      session.commit(later ? second : first, { totalManual: false });
      assert.deepEqual(
        session.getSnapshot().values,
        later
          ? { total: 20, quantity: 2, price: 10, totalManual: false }
          : { total: 40, quantity: 2, price: 10, totalManual: true },
      );
    }),
  );
});

test("repeating the mode from onChange preserves the current rule for the canonical value", async () => {
  const session = createSession(
    saleWith({
      value: ({ quantity, price }) => quantity * price,
      onChange: manual,
    }),
    { initial: { total: 30, totalManual: true } },
  );
  const sent = await session.prepare();
  session.edit("total", 40);
  session.commit(sent, { totalManual: false });
  assert.deepEqual(session.getSnapshot().values, {
    total: 40,
    quantity: 2,
    price: 10,
    totalManual: false,
  });
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 30);
});

test("a failed read rejects onEdit even when caught; undefined skips a write", () => {
  const session = createSession(
    defineForm({
      fields: {
        trigger: field.number(),
        problem: field.number(),
        source: field.checkbox(),
        log: field.text(),
      },
      rules: {
        trigger: {
          onEdit: (values) => {
            try {
              void values.problem;
            } catch {
              return { log: "Not published" };
            }
            return { log: undefined };
          },
        },
        problem: {
          value: ({ source }) => {
            if (source) throw new Error("Failed");
            return 0;
          },
        },
      },
    }),
    { initial: { log: "Initial" } },
  );
  rejects(
    session,
    () => session.patch({ trigger: 1, source: true }),
    'Field "problem" value: formula failed: Failed',
  );
  session.edit("trigger", 2);
  assert.deepEqual(session.getSnapshot().values, {
    trigger: 2,
    problem: 0,
    source: false,
    log: "Initial",
  });
});
