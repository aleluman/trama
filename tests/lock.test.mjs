import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { mapStates } from "./helpers/session.mjs";

const order = () =>
  defineForm({
    fields: {
      customer: field.text({ label: "Customer" }),
      quantity: field.number({ default: 2 }),
      includeNote: field.checkbox({ default: true }),
      confirmed: field.checkbox(),
      note: field.text({ default: "Leave with the concierge" }),
    },
    rules: {
      note: { disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed] },
    },
    form: {
      readOnly: [
        { value: ({ confirmed }) => confirmed && "Order confirmed", except: ["confirmed"] },
      ],
    },
  });
const lockedBy = (session) =>
  mapStates(session, ({ readOnly, reasons }) => (readOnly ? reasons : false));

test("a confirmed order becomes read-only except for confirmation, and clearing confirmation restores the state", () => {
  const session = createSession(order());
  const opened = session.getSnapshot().fieldStates;
  const locked = ["Order confirmed"];
  const confirmed = {
    customer: locked,
    quantity: locked,
    includeNote: locked,
    confirmed: false,
    note: locked,
  };
  session.edit("confirmed", true);
  assert.deepEqual(lockedBy(session), confirmed);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, true);
  session.edit("confirmed", false);
  assert.deepEqual(session.getSnapshot().fieldStates, opened);
  const supplied = createSession(order(), { initial: { confirmed: true } });
  assert.deepEqual(lockedBy(supplied), confirmed);
  supplied.edit("confirmed", false);
  supplied.reset();
  assert.equal(
    supplied.getSnapshot().fieldStates.customer.readOnly,
    true,
    "reset locks the form again",
  );
});

test("an exception excludes only the form lock contribution, so the field remains read-only because of its rules and field configuration", () => {
  const definition = defineForm({
    fields: {
      locked: field.checkbox(),
      review: field.checkbox(),
      approved: field.checkbox({ readOnly: "External approval" }),
      note: field.text(),
      comment: field.text(),
    },
    rules: {
      note: { readOnly: ({ review }) => review && "Under review" },
      review: { states: ({ review }) => (review ? { comment: { readOnly: true } } : undefined) },
    },
    form: {
      readOnly: {
        value: ({ locked }) => locked && "Locked",
        except: ["locked", "note", "comment", "approved"],
      },
    },
  });
  const session = createSession(definition);
  session.edit("locked", true);
  assert.deepEqual(lockedBy(session), {
    locked: false,
    review: ["Locked"],
    approved: ["External approval"],
    note: false,
    comment: false,
  });
  session.edit("review", true);
  assert.deepEqual(lockedBy(session), {
    locked: false,
    review: ["Locked"],
    approved: ["External approval"],
    note: ["Under review"],
    comment: [],
  });
});

test("multiple entries append their reasons in order, true locks without a reason, and duplicates in except are accepted", () => {
  const definition = defineForm({
    fields: {
      a: field.checkbox(),
      b: field.checkbox(),
      note: field.text({ readOnly: "Field" }),
    },
    rules: { note: { disabled: ({ a }) => a && "Rule" } },
    form: {
      readOnly: [
        { value: ({ b }) => b, except: ["a", "a"] },
        { value: ({ b }) => b && "Second", except: ["b"] },
        { value: ({ a }) => a && "Field" },
      ],
    },
  });
  const session = createSession(definition);
  session.edit("a", true);
  assert.deepEqual(lockedBy(session), { a: ["Field"], b: ["Field"], note: ["Field", "Rule"] });
  session.edit("b", true);
  assert.deepEqual(lockedBy(session), {
    a: ["Second", "Field"],
    b: ["Field"],
    note: ["Field", "Rule", "Second"],
  });
  session.edit("a", false);
  assert.deepEqual(lockedBy(session), { a: ["Second"], b: [], note: ["Field", "Second"] });
});

test("the form lock does not prevent writes from the core, formulas, or events, and peek does not trigger it", () => {
  const definition = defineForm({
    fields: {
      confirmed: field.checkbox(),
      quantity: field.number({ default: 2 }),
      total: field.number(),
      note: field.text(),
      mode: field.text(),
    },
    rules: {
      total: { value: ({ quantity }) => (quantity ?? 0) * 10 },
      confirmed: { onChange: ({ confirmed }) => ({ note: confirmed ? "Confirmed" : "" }) },
    },
    form: {
      readOnly: { value: ({ confirmed }, { peek }) => confirmed && peek.mode !== "open" },
    },
  });
  const session = createSession(definition);
  session.edit("confirmed", true);
  assert.equal(session.getSnapshot().values.note, "Confirmed");
  session.edit("quantity", 5);
  session.edit("note", "Edited");
  assert.deepEqual(session.getSnapshot().values, {
    confirmed: true,
    quantity: 5,
    total: 50,
    note: "Edited",
    mode: "",
  });
  assert.equal(session.getSnapshot().fieldStates.total.readOnly, true);
  session.edit("mode", "open");
  assert.equal(
    session.getSnapshot().fieldStates.total.readOnly,
    true,
    "peek does not cause reevaluation",
  );
  session.edit("confirmed", false);
  session.edit("confirmed", true);
  assert.equal(session.getSnapshot().fieldStates.total.readOnly, false);
});
