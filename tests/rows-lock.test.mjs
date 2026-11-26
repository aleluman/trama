import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

// The lock of the form reaches the fields of every row, also of rows added
// later; an exception by collection holds in every row, and the states of each
// row follow the visual order and keep their identity while they do not change.
const order = (readOnly, each = {}) =>
  defineForm({
    fields: { sent: field.checkbox(), audit: field.checkbox(), notes: field.text() },
    collections: {
      lines: { fields: { price: field.number(), notes: field.text(), free: field.checkbox() } },
    },
    rules: { lines: { each } },
    form: { readOnly },
  });
const sent = (except = []) => ({
  value: ({ sent: value }) => value && "Sent",
  except: ["sent", ...except],
});
// Its own rule makes a free line read-only, in price and in notes.
const ownLock = (line) => line.free && "Free";
const ownRules = { price: { readOnly: ownLock }, notes: { readOnly: ownLock } };

// What each field shows of the lock: false, or its reasons while read-only;
// the rows of lines as an array, in visual order.
const shownOf = (state) => (state.readOnly ? state.reasons : false);
const project = (states) =>
  Object.fromEntries(
    Object.entries(states).map(([name, state]) => [
      name,
      Array.isArray(state) ? state.map((record) => project(record)) : shownOf(state),
    ]),
  );
const locks = (session) => project(session.getSnapshot().fieldStates);
const locked = ["Sent"];
const row = (price, notes, free = price) => ({ price, notes, free });

// The states without dirty, which the rows an operation adds have.
const withoutDirty = (states) =>
  JSON.parse(JSON.stringify(states, (key, value) => (key === "dirty" ? undefined : value)));

test("form.readOnly reaches all row fields, including those added later, and removing it restores their state", () => {
  const session = createSession(order(sent()), { initial: { lines: [{}, {}] } });
  const opened = session.getSnapshot().fieldStates;
  session.edit("sent", true);
  const all = row(locked, locked);
  assert.deepEqual(locks(session), {
    sent: false,
    audit: locked,
    notes: locked,
    lines: [all, all],
  });
  const [first] = session.add("lines", [{}], { at: 0 });
  const [last] = session.add("lines", [{ price: 5 }]);
  assert.deepEqual(locks(session).lines, [all, all, all, all]);
  // The handle of an added row publishes the same states.
  const { lines } = session.getSnapshot().fieldStates;
  assert.equal(session.row("lines", first).getSnapshot().fieldStates, lines[0]);
  assert.equal(session.row("lines", last).getSnapshot().fieldStates, lines[3]);
  session.edit("sent", false);
  const { fieldStates } = session.getSnapshot();
  assert.deepEqual(
    withoutDirty(fieldStates),
    withoutDirty({ ...opened, lines: [1, 2, 3, 4].map(() => opened.lines[0]) }),
  );
});

test("A session opened with a lock locks added rows, and reset restores the baseline lock", () => {
  const session = createSession(order(sent()), { initial: { sent: true, lines: [{}] } });
  const all = row(locked, locked);
  session.add("lines", [{}, {}], { at: 1 });
  assert.deepEqual(locks(session).lines, [all, all, all]);
  session.edit("sent", false);
  session.add("lines", [{}]);
  session.reset();
  assert.deepEqual(locks(session).lines, [all]);
});

test("A collection exception applies to all rows, including added rows, and leaves a header field of the same name unaffected", () => {
  for (const [except, header, notes] of [
    [[{ lines: ["notes"] }], locked, false],
    [["notes"], false, locked],
    [["notes", { lines: ["notes"] }], false, false],
  ]) {
    const session = createSession(order(sent(except)), { initial: { sent: true, lines: [{}] } });
    session.add("lines", [{}], { at: 0 });
    session.add("lines", [{ notes: "New" }]);
    const lines = row(locked, notes);
    assert.deepEqual(locks(session), {
      sent: false,
      audit: locked,
      notes: header,
      lines: [lines, lines, lines],
    });
  }
});

test("Multiple lock entries append their reasons in order, each with its own row exceptions", () => {
  const audit = {
    value: ({ audit: value }) => value && "Audit",
    except: ["audit", { lines: ["free"] }],
  };
  const session = createSession(order([sent([{ lines: ["notes"] }]), audit]), {
    initial: { lines: [{}] },
  });
  const both = ["Sent", "Audit"];
  const audited = ["Audit"];
  session.edit("sent", true);
  assert.deepEqual(locks(session).lines, [row(locked, false, locked)]);
  session.edit("audit", true);
  assert.deepEqual(locks(session), {
    sent: audited,
    audit: locked,
    notes: both,
    lines: [row(both, audited, locked)],
  });
  session.add("lines", [{}], { at: 0 });
  session.edit("sent", false);
  assert.deepEqual(
    locks(session).lines,
    [1, 2].map(() => row(audited, audited, false)),
  );
});

test("A row rule's contribution persists when its field is excepted and when the lock is removed", () => {
  const session = createSession(order(sent([{ lines: ["notes"] }]), ownRules), {
    initial: { lines: [{ free: true }, {}] },
  });
  const own = ["Free"];
  const opened = session.getSnapshot().fieldStates;
  assert.deepEqual(locks(session).lines, [row(own, own, false), row(false, false)]);
  session.edit("sent", true);
  // Own reasons go first and the lock's after them; notes keeps only its own.
  assert.deepEqual(locks(session).lines, [
    row(["Free", "Sent"], own, locked),
    row(locked, false, locked),
  ]);
  const [added] = session.add("lines", [{ free: true }]);
  assert.deepEqual(locks(session).lines[2], row(["Free", "Sent"], own, locked));
  session.edit("sent", false);
  const { fieldStates } = session.getSnapshot();
  assert.deepEqual(
    withoutDirty(fieldStates),
    withoutDirty({ ...opened, lines: [...opened.lines, opened.lines[0]] }),
  );
  session.remove("lines", [added]);
  assert.deepEqual(locks(session).lines, [row(own, own, false), row(false, false)]);
});

test("fieldStates.lines follows visual order after a move, and each row's states keep their identity while unchanged", () => {
  const session = createSession(order(sent(), ownRules), {
    initial: { lines: [{}, { free: true }, {}] },
  });
  const [a, b, c] = session.getSnapshot().rows.lines;
  const before = session.getSnapshot().fieldStates;
  session.move("lines", c, 0);
  const moved = session.getSnapshot().fieldStates;
  assert.deepEqual(session.getSnapshot().rows.lines, [c, a, b]);
  assert.notEqual(moved.lines, before.lines);
  for (const [index, from] of [2, 0, 1].entries())
    assert.equal(moved.lines[index], before.lines[from]);
  for (const name of ["sent", "audit", "notes"]) assert.equal(moved[name], before[name]);
  // An edit changes only the state of its field, now dirty; another edit that
  // changes no state keeps every state object.
  session.row("lines", a).edit("price", 3);
  const edited = session.getSnapshot().fieldStates;
  assert.notEqual(edited.lines[1].price, moved.lines[1].price);
  assert.equal(edited.lines[0], moved.lines[0]);
  session.row("lines", a).edit("price", 4);
  assert.equal(session.getSnapshot().fieldStates, edited);
  // A state that changes replaces the record of its row only.
  session.row("lines", a).edit("free", true);
  const changed = session.getSnapshot().fieldStates;
  assert.deepEqual(project(changed.lines[1]), row(["Free"], ["Free"], false));
  assert.notEqual(changed.lines[1], edited.lines[1]);
  assert.equal(changed.lines[0], edited.lines[0]);
  assert.equal(changed.lines[2], edited.lines[2]);
  assert.equal(changed.sent, edited.sent);
  // Adding and removing keep the records of the rows that stay.
  session.add("lines", [{}], { at: 0 });
  session.remove("lines", [b]);
  const after = session.getSnapshot().fieldStates;
  assert.equal(after.lines[1], changed.lines[0]);
  assert.equal(after.lines[2], changed.lines[1]);
});
