import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { pickStates } from "./helpers/session.mjs";

const orderFields = () => ({
  customer: field.text({ label: "Customer" }),
  includeNote: field.checkbox({ label: "Include delivery note", default: true }),
  confirmed: field.checkbox({ label: "Order confirmed" }),
  note: field.text({ label: "Delivery note", default: "Leave with the concierge" }),
});
const byIncludeNote = ({ includeNote }) => !includeNote;
const byConfirmed = ({ confirmed }) => confirmed;
const noteDisabled = (session) => session.getSnapshot().fieldStates.note.disabled;

test("the note is disabled when it is excluded or the order is confirmed, without losing its value", () => {
  const order = defineForm({
    fields: orderFields(),
    rules: {
      note: { disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed] },
    },
  });
  const session = createSession(order);
  const other = createSession(order);
  assert.deepEqual(pickStates(session, "disabled"), {
    customer: { disabled: false },
    includeNote: { disabled: false },
    confirmed: { disabled: false },
    note: { disabled: false },
  });
  session.edit("includeNote", false);
  assert.equal(noteDisabled(session), true);
  assert.equal(session.getSnapshot().values.note, "Leave with the concierge");
  session.edit("includeNote", true);
  assert.equal(noteDisabled(session), false);
  session.edit("confirmed", true);
  assert.equal(noteDisabled(session), true);
  assert.equal(session.getSnapshot().values.note, "Leave with the concierge");
  assert.equal(session.getSnapshot().fieldStates.confirmed.disabled, false);
  assert.equal(noteDisabled(other), false);
});

test("withdrawing one contribution leaves the note disabled while another disables it, in either order", () => {
  for (const contributions of [
    [byIncludeNote, byConfirmed],
    [byConfirmed, () => false, byIncludeNote],
    [({ confirmed }) => (confirmed ? true : undefined), byIncludeNote],
  ]) {
    const order = defineForm({
      fields: orderFields(),
      rules: { note: { disabled: contributions } },
    });
    const session = createSession(order, {
      initial: { includeNote: false, confirmed: true, note: "Saved" },
    });
    assert.equal(noteDisabled(session), true);
    session.edit("includeNote", true);
    assert.equal(noteDisabled(session), true, "confirmed still disables it");
    session.edit("includeNote", false);
    session.edit("confirmed", false);
    assert.equal(noteDisabled(session), true, "includeNote still disables it");
    session.edit("includeNote", true);
    assert.equal(noteDisabled(session), false);
    assert.equal(session.getSnapshot().values.note, "Saved");
  }
});

test("opening and reset give the same result for the same values, including supplied values", () => {
  const order = defineForm({
    fields: orderFields(),
    rules: { note: { disabled: [byIncludeNote, byConfirmed] } },
  });
  for (const [initial, disabled] of [
    [undefined, false],
    [{ includeNote: false }, true],
    [{ confirmed: true, note: "Saved" }, true],
    [{ includeNote: true, confirmed: false }, false],
  ]) {
    const session = createSession(order, initial === undefined ? undefined : { initial });
    assert.equal(noteDisabled(session), disabled);
    const opened = session.getSnapshot().fieldStates;
    if (disabled) {
      session.edit("includeNote", true);
      session.edit("confirmed", false);
    } else session.edit("includeNote", false);
    assert.equal(noteDisabled(session), !disabled, "The edit changed the opening state");
    session.reset();
    assert.deepEqual(session.getSnapshot().fieldStates, opened);
  }
});

test("peek reads without creating a dependency, and reset reevaluates against the baseline", () => {
  const order = defineForm({
    fields: orderFields(),
    rules: {
      note: { disabled: ({ confirmed }, { peek: { customer } }) => confirmed && customer === "" },
    },
  });
  const session = createSession(order, { initial: { confirmed: true } });
  assert.equal(noteDisabled(session), true);
  session.edit("customer", "Ana");
  assert.equal(noteDisabled(session), true, "Changing only peek reads skips reevaluation");
  session.edit("confirmed", false);
  session.edit("confirmed", true);
  assert.equal(noteDisabled(session), false, "On reevaluation, peek sees the final value");
  session.reset();
  assert.equal(noteDisabled(session), true);
  assert.equal(session.getSnapshot().values.customer, "");
});

test("disabled branches track their current dependencies and skip reevaluation when values are unchanged, and the published state is read-only", () => {
  let result = true;
  const definition = defineForm({
    fields: {
      alternate: field.checkbox(),
      a: field.checkbox(),
      b: field.checkbox(),
      note: field.text(),
    },
    rules: {
      note: {
        disabled: (values) => ((values.alternate ? values.b : values.a) ? result : undefined),
      },
    },
  });
  const session = createSession(definition, { initial: { a: true } });
  const original = session.getSnapshot();
  result = false;
  assert.throws(() => {
    original.fieldStates.note.disabled = false;
  }, TypeError);
  assert.throws(() => {
    original.fieldStates.note = { disabled: false };
  }, TypeError);
  session.edit("a", true);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, true);
  session.edit("b", true);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, true);
  session.edit("alternate", true);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, false);
  result = true;
  session.edit("a", false);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, false);
  session.edit("b", false);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, false);
  session.edit("b", true);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, true);
  session.reset();
  session.edit("a", false);
  assert.equal(session.getSnapshot().fieldStates.note.disabled, false);
  assert.equal(original.fieldStates.note.disabled, true);
});

// confirmed is declared before status, so the event of status reveals a
// destination the attempt already settled and the candidate starts again.
// Each contribution records the value it read.
const statusOrder = (seen) =>
  defineForm({
    fields: {
      confirmed: field.checkbox(),
      includeNote: field.checkbox({ default: true }),
      status: field.select({
        options: [
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Sent" },
        ],
        default: "draft",
      }),
      note: field.text({ default: "Leave with the concierge" }),
    },
    rules: {
      note: {
        disabled: [
          ({ includeNote }) => {
            seen.push(["includeNote", includeNote]);
            return !includeNote;
          },
          ({ confirmed }) => {
            seen.push(["confirmed", confirmed]);
            return confirmed;
          },
        ],
      },
      includeNote: { value: ({ status }) => status === "draft" },
      status: { onChange: ({ status }) => ({ confirmed: status === "sent" }) },
    },
  });

test("disabled sees the final values written by formulas and events in the same operation", () => {
  const seen = [];
  const order = statusOrder(seen);
  const session = createSession(order);
  assert.equal(noteDisabled(session), false);
  const published = [];
  session.subscribe(() => published.push(session.getSnapshot()));
  seen.length = 0;
  session.edit("status", "sent");
  assert.deepEqual(session.getSnapshot().values, {
    confirmed: true,
    includeNote: false,
    status: "sent",
    note: "Leave with the concierge",
  });
  assert.equal(published.length, 1);
  assert.equal(published[0].fieldStates.note.disabled, true);
  assert.ok(seen.length > 0);
  assert.deepEqual(
    seen.filter(([name, value]) => value !== session.getSnapshot().values[name]),
    [],
    "No contribution sees an intermediate value",
  );
  session.edit("confirmed", false);
  assert.equal(noteDisabled(session), true, "includeNote, set by the formula, disables the note");
  session.edit("status", "draft");
  assert.equal(noteDisabled(session), false);
  assert.equal(session.getSnapshot().values.includeNote, true);
});

test("disabled reads its own field's final value without creating a cycle", () => {
  const order = defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      price: field.number({ default: 5000 }),
      total: field.number(),
    },
    rules: {
      total: {
        disabled: ({ total }) => (total ?? 0) > 100_000,
        value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0),
      },
    },
  });
  const session = createSession(order);
  assert.equal(session.getSnapshot().fieldStates.total.disabled, false);
  session.edit("quantity", 30);
  assert.equal(session.getSnapshot().values.total, 150_000);
  assert.equal(session.getSnapshot().fieldStates.total.disabled, true);
  session.edit("total", 5);
  assert.equal(session.getSnapshot().fieldStates.total.disabled, false);
  session.edit("total", 200_000);
  assert.equal(session.getSnapshot().fieldStates.total.disabled, true);
  session.reset();
  assert.equal(session.getSnapshot().values.total, 10_000);
  assert.equal(session.getSnapshot().fieldStates.total.disabled, false);
});

test("a disabled field accepts core edits and writes from formulas and events", () => {
  const order = defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      total: field.number(),
      customer: field.text(),
      confirmed: field.checkbox(),
      note: field.text(),
    },
    rules: {
      total: {
        value: ({ quantity }) => (quantity ?? 0) * 1000,
        disabled: ({ confirmed }) => confirmed,
      },
      note: { disabled: ({ confirmed }) => confirmed },
      confirmed: { onChange: ({ confirmed }) => (confirmed ? { note: "Confirmed" } : undefined) },
      customer: { onChange: ({ customer }) => ({ note: `Deliver to ${customer}` }) },
    },
  });
  const session = createSession(order);
  session.edit("confirmed", true);
  assert.equal(session.getSnapshot().values.note, "Confirmed");
  assert.equal(noteDisabled(session), true);
  session.edit("customer", "Ana");
  assert.equal(session.getSnapshot().values.note, "Deliver to Ana");
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 3000);
  session.edit("note", "Imported");
  session.edit("total", 1);
  assert.deepEqual(pickStates(session, "disabled"), {
    quantity: { disabled: false },
    total: { disabled: true },
    customer: { disabled: false },
    confirmed: { disabled: false },
    note: { disabled: true },
  });
  session.edit("confirmed", false);
  assert.equal(noteDisabled(session), false);
  assert.equal(session.getSnapshot().values.note, "Imported");
  assert.equal(session.getSnapshot().values.total, 1);
});

test("the definition retains declared contributions even if the author later changes their array", () => {
  const contributions = [byIncludeNote];
  const entry = { disabled: contributions };
  const order = defineForm({ fields: orderFields(), rules: { note: entry } });
  contributions.push(() => true);
  contributions[0] = () => true;
  entry.disabled = () => true;
  const session = createSession(order);
  assert.equal(noteDisabled(session), false);
  session.edit("includeNote", false);
  assert.equal(noteDisabled(session), true);
});
