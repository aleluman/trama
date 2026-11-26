import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const n = (value = 0) => field.number({ default: value });

// A depot for every line: the depot of the header writes the depot of each
// line, whose event clears the lot of that line, declared before it.
const lines = (count, amount) => {
  const fields = { depot: field.number({ default: 1 }) };
  const rules = {
    depot: {
      onChange: ({ depot }) =>
        Object.fromEntries(Array.from({ length: count }, (_, line) => [`depot${line}`, depot])),
    },
  };
  for (let line = 0; line < count; line++) {
    fields[`lot${line}`] = field.number({ default: 7 });
    fields[`depot${line}`] = field.number({ default: 1 });
    fields[`amount${line}`] = field.number();
    rules[`depot${line}`] = { onChange: () => ({ [`lot${line}`]: null }) };
    rules[`amount${line}`] = { value: (values) => amount(values[`depot${line}`]) };
  }
  return defineForm({ fields, rules });
};

test("A destination discovered late rebuilds the candidate from the field that resolved it without repeating earlier fields", () => {
  let evaluations = 0;
  const session = createSession(lines(50, (depot) => (evaluations++, depot * 10)));
  evaluations = 0;
  session.edit("depot", 2);
  const { values } = session.getSnapshot();
  for (let line = 0; line < 50; line++) {
    assert.equal(values[`lot${line}`], null);
    assert.equal(values[`depot${line}`], 2);
    assert.equal(values[`amount${line}`], 20);
  }
  // Starting again from the first field would run the amount of every line
  // once per line before it: 1,275 evaluations.
  assert.equal(evaluations, 50);
});

// check reads zone before the event of depot writes it, and fails until then.
// A field settles before check, so the candidate goes back to check instead of
// starting again.
const consistent = (zone, depot) => {
  if (zone !== null && zone !== depot)
    throw new Error(`Zone ${zone} does not belong to depot ${depot}`);
  return depot;
};
const zoneRules = {
  check: { value: ({ zone, depot }) => consistent(zone, depot) },
  depot: { onChange: ({ depot }) => ({ zone: depot }) },
};

test("Rebuilding from a field discards a failure in a later field", () => {
  const session = createSession(
    defineForm({
      fields: { note: field.text(), check: n(), zone: n(), depot: n() },
      rules: zoneRules,
    }),
    { initial: { zone: 1, depot: 1 } },
  );
  session.edit("depot", 2);
  assert.deepEqual(session.getSnapshot().values, { note: "", check: 2, zone: 2, depot: 2 });
});

// limit fails before check, and nothing the event writes changes it.
const limit = ({ depot }) => {
  if (depot > 1) throw new Error(`Depot ${depot} has no limit`);
  return 0;
};

test("Rebuilding from a field preserves a failure in an earlier field", () => {
  const session = createSession(
    defineForm({
      fields: { limit: n(), check: n(), zone: n(), depot: n() },
      rules: { ...zoneRules, limit: { value: limit } },
    }),
    { initial: { zone: 1, depot: 1 } },
  );
  rejects(
    session,
    () => session.edit("depot", 2),
    'Field "limit" value: formula failed: Depot 2 has no limit',
  );
});

test("Values a formula read in fields that are rebuilt do not remain its dependencies", () => {
  // shown reads y while x is 1; the event of trigger then writes x back to 0, so
  // shown does not run again and keeps depending on z, as since the opening.
  const session = createSession(
    defineForm({
      fields: { note: field.text(), x: n(), shown: n(), y: n(1), z: n(2), trigger: n() },
      rules: {
        x: { value: ({ trigger }) => trigger },
        shown: { value: (values) => (values.x > 0 ? values.y : values.z) },
        trigger: { onChange: () => ({ x: 0 }) },
      },
    }),
  );
  session.edit("trigger", 1);
  assert.equal(session.getSnapshot().values.x, 0);
  assert.equal(session.getSnapshot().values.shown, 2);
  session.edit("z", 5);
  assert.equal(session.getSnapshot().values.shown, 5);
});

test("An event that runs with a value that later changes does not give its destinations precedence. With two fixed points, it reaches the usual one", () => {
  // c.onChange writes b, which x already read. Learning that x.onChange writes
  // c from that value of b would reach another fixed point: b 2, c 1 and x 2.
  const session = createSession(
    defineForm({
      fields: { a: n(1), b: n(1), c: n(), x: n() },
      rules: {
        a: { onChange: () => ({ b: 2 }) },
        c: { value: ({ a }) => a, onChange: () => ({ b: 1 }) },
        x: { value: ({ b }) => b, onChange: () => ({ c: 1 }) },
      },
    }),
  );
  session.edit("a", 3);
  assert.deepEqual(session.getSnapshot().values, { a: 3, b: 1, c: 3, x: 1 });
});

test("A writer discovered late does not get ahead of another writer of the same field. The field keeps its value and its event does not run", () => {
  // c.onChange writes e, read before. d.onChange writes g, but so does
  // e.onChange, and with both g keeps its value. Learning d.onChange first would
  // change g for a while, run g.onChange and close a cycle through h.
  const invoked = [];
  const session = createSession(
    defineForm({
      fields: { a: n(1), b: n(), g: n(), e: n(), f: n(), c: n(), d: n(), h: n() },
      rules: {
        c: { onChange: ({ f }) => (invoked.push("c"), { e: f }) },
        d: { value: ({ c }) => c, onChange: () => (invoked.push("d"), { g: 2 }) },
        e: { onChange: ({ b }) => (invoked.push("e"), { g: b }) },
        f: { value: ({ d }) => d },
        g: { onChange: ({ h, d, f }) => (invoked.push("g"), { h, b: d, f: f + 1 }) },
        h: { onChange: ({ d, c }) => (invoked.push("h"), { e: 1, f: d, c: c + 1 }) },
      },
    }),
  );
  session.edit("c", 2);
  const values = { a: 1, b: 0, g: 0, e: 2, f: 2, c: 2, d: 2, h: 0 };
  assert.deepEqual(session.getSnapshot().values, values);
  assert.deepEqual(invoked, ["c", "e", "d"]);
});

// loop closes a cycle once a changes. x reads source: with b, which keeps its
// value, x does not change; with a, its event runs and makes the attempt go back.
const cycleAfter = (source) => {
  const invoked = [];
  const session = createSession(
    defineForm({
      fields: { a: n(1), b: n(1), c: n(), loop: n(), x: n() },
      rules: {
        a: { onChange: () => (invoked.push("a"), { b: 2 }) },
        c: { value: ({ a }) => a, onChange: () => (invoked.push("c"), { b: 1 }) },
        loop: { value: ({ a }, { peek }) => (a === 1 ? 0 : peek.loop) },
        x: { value: (values) => values[source], onChange: () => (invoked.push("x"), { c: 1 }) },
      },
    }),
  );
  rejects(session, () => session.edit("a", 3), 'Field "loop" value: cyclic dependency loop → loop');
  return invoked;
};

test("A cycle in a field after a destination discovered late rejects the operation with that cycle even if a later event rewinds it", () => {
  assert.deepEqual(cycleAfter("b"), ["a", "c"]);
  assert.deepEqual(cycleAfter("a"), ["a", "c", "x"]);
});
