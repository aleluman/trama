import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";

const { defineForm, field } = createForms({
  endpoints: [defineEndpoints({ accounts: endpoint.list(() => Promise.resolve([])) })],
});
const held = { value: 1, label: "Existing" };

// Two formulas return the same option once trigger is set. kept holds an option
// with that value since the opening, so it keeps it; written held none, so it
// gets a copy of the option the formula returned.
const accounts = (names, rules = {}) => {
  const shared = { value: 1, label: "New" };
  const fields = Object.fromEntries(names.map((name) => [name, field.async("accounts")]));
  const formula = ({ trigger }) => (trigger ? shared : undefined);
  return defineForm({
    fields: { ...fields, trigger: field.number({ default: 0 }) },
    rules: { kept: { value: formula }, written: { value: formula }, ...rules },
  });
};
const edited = (definition) => {
  const session = createSession(definition, { scope: "acme", initial: { kept: held } });
  session.edit("trigger", 1);
  const { kept, written } = session.getSnapshot().values;
  return { kept, written };
};

test("Each field gets its own copy of an option returned by two formulas and does not take the option the other field kept", () => {
  const { kept, written } = edited(accounts(["kept", "written"]));
  assert.deepEqual(kept, held);
  assert.deepEqual(written, { value: 1, label: "New" });
});

test("The field still gets its own copy when the candidate is rebuilt after the other field kept its option", () => {
  // The event of trigger writes late, declared before it, so the candidate is
  // redone after kept adopted the option.
  const definition = accounts(["written", "kept", "late"], {
    trigger: { onChange: () => ({ late: held }) },
  });
  const { kept, written } = edited(definition);
  assert.deepEqual(kept, held);
  assert.deepEqual(written, { value: 1, label: "New" });
});
