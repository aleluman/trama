import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects, states } from "./helpers/session.mjs";

const civil = "expected a civil date YYYY-MM-DD between 0001 and 9999";
const valid = ["0001-01-01", "9999-12-31", "2000-02-29", "2024-02-29", "2026-04-30", "2026-12-31"];
const invalid = [
  "2026-02-30",
  "2026-2-1",
  "0000-01-01",
  "1900-02-29",
  "2026-13-01",
  "2026-00-10",
  "2026-04-31",
  "2026-01-01T00:00",
  "01-02-2026",
  " 2026-01-01",
  "",
  "１２３４-01-01",
  20260101,
  new Date(0),
  undefined,
];

test("a date is a YYYY-MM-DD civil date or null, with null as its empty value and no normalization", () => {
  const session = createSession(defineForm({ fields: { from: field.date() } }));
  assert.equal(session.getSnapshot().values.from, null);
  for (const value of [...valid, null]) {
    session.edit("from", value);
    assert.equal(session.getSnapshot().values.from, value);
  }
  for (const value of invalid.filter((item) => item !== undefined))
    rejects(session, () => session.edit("from", value), `Field "from" (date): ${civil}`);
});

test("a date is validated the same way in the default, initial, a formula, and a patch", () => {
  assert.throws(() => defineForm({ fields: { from: field.date({ default: "2026-02-30" }) } }), {
    message: `Field "from" (date): ${civil}`,
  });
  const definition = defineForm({
    fields: {
      from: field.date({ default: "2026-01-01" }),
      to: field.date(),
      due: field.date(),
      shift: field.text(),
    },
    rules: {
      to: { value: ({ shift }) => (shift === "" ? undefined : shift) },
      from: { onChange: ({ from }) => ({ due: from === "2026-03-01" ? "2026-03-32" : undefined }) },
    },
  });
  assert.throws(() => createSession(definition, { initial: { to: "2026-2-1" } }), {
    message: `Field "to" (date): ${civil}`,
  });
  const session = createSession(definition);
  assert.equal(session.getSnapshot().values.from, "2026-01-01");
  rejects(
    session,
    () => session.edit("shift", "tomorrow"),
    `Field "to" value: incompatible result for date field: ${civil}`,
  );
  rejects(
    session,
    () => session.edit("from", "2026-03-01"),
    `Field "from" onChange: incompatible value for date field "due": ${civil}`,
  );
  rejects(
    session,
    () => session.patch({ to: "29/02/2024" }),
    `Patch: incompatible value for date field "to": ${civil}`,
  );
});

test("a date has a placeholder in the definition and in rules", () => {
  const session = createSession(
    defineForm({
      fields: { from: field.date({ placeholder: "YYYY-MM-DD" }), to: field.date() },
      rules: {
        to: { placeholder: ({ from }) => (from === null ? "Start date first" : undefined) },
      },
    }),
  );
  assert.equal(states(session).from.placeholder, "YYYY-MM-DD");
  assert.equal(states(session).to.placeholder, "Start date first");
});
