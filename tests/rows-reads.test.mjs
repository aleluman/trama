import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs, rejects } from "./helpers/session.mjs";

const keys = (session) => session.getSnapshot().rows.lines;
const probeOf = (session) => session.getSnapshot().values.probe;
// Three lines, and a header field whose formula reads them as given.
const open = (formula) =>
  createSession(
    defineForm({
      fields: { note: field.text(), probe: field.text() },
      collections: {
        lines: { fields: { name: field.text(), quantity: field.number({ default: 1 }) } },
      },
      rules: { probe: { value: formula } },
    }),
    { initial: { lines: [{ name: "a" }, { name: "b", quantity: 2 }, { name: "c", quantity: 3 }] } },
  );
// What an attempt to change a view throws.
const outcome = (attempt) => {
  try {
    attempt();
    return "changed";
  } catch (error) {
    return error instanceof TypeError ? "TypeError" : String(error);
  }
};

test("A collection can be read as an array with length, indexing, at, map, filter, reduce, spread, keys, and JSON", () => {
  let seen;
  open(({ lines }) => {
    seen = {
      isArray: Array.isArray(lines),
      length: lines.length,
      first: lines[0].name,
      last: lines.at(-1).name,
      outside: lines[3],
      has: [0 in lines, 3 in lines],
      names: lines.map((line) => line.name),
      large: lines.filter((line) => line.quantity > 1).map((line) => line.name),
      sum: lines.reduce((total, line) => total + line.quantity, 0),
      spread: [...lines].map((line) => line.quantity),
      keys: Object.keys(lines),
      row: { ...lines[1] },
      entries: Object.entries(lines[2]),
      descriptor: Object.getOwnPropertyDescriptor(lines, "0").value.name,
      json: JSON.stringify(lines),
    };
  });
  assert.deepEqual(seen, {
    isArray: true,
    length: 3,
    first: "a",
    last: "c",
    outside: undefined,
    has: [true, false],
    names: ["a", "b", "c"],
    large: ["b", "c"],
    sum: 6,
    spread: [1, 2, 3],
    keys: ["0", "1", "2"],
    row: { name: "b", quantity: 2 },
    entries: [
      ["name", "c"],
      ["quantity", 3],
    ],
    descriptor: "a",
    json: '[{"name":"a","quantity":1},{"name":"b","quantity":2},{"name":"c","quantity":3}]',
  });
});

test("Reading only positions absent from the collection depends on its structure, so adding rows recalculates and can be rejected", () => {
  const session = createSession(
    defineForm({
      fields: { first: field.number(), has: field.checkbox(), second: field.text() },
      collections: { lines: { fields: { price: field.number() } } },
      rules: {
        first: {
          value: ({ lines }) => {
            if (lines[0]?.price < 0) throw new Error("negative price");
            return lines[0]?.price ?? -1;
          },
          disabled: ({ lines }) => lines[0] !== undefined,
        },
        has: { value: ({ lines }) => 0 in lines },
        second: { value: ({ lines }) => typeof Object.getOwnPropertyDescriptor(lines, "1")?.value },
      },
      outputs: ({ output }) => ({ first: output(({ lines }) => lines[0]?.price ?? null) }),
    }),
  );
  const state = () => {
    const { values, fieldStates } = session.getSnapshot();
    const { first, has, second } = values;
    const output = currentOutputs(session).first;
    return { first, has, second, disabled: fieldStates.first.disabled, output };
  };
  assert.deepEqual(state(), {
    first: -1,
    has: false,
    second: "undefined",
    disabled: false,
    output: null,
  });
  session.add("lines", [{ price: 7 }]);
  assert.deepEqual(state(), {
    first: 7,
    has: true,
    second: "undefined",
    disabled: true,
    output: 7,
  });
  session.add("lines", [{ price: 3 }]);
  assert.equal(session.getSnapshot().values.second, "object");
  rejects(
    session,
    () => session.add("lines", [{ price: -2 }], { at: 0 }),
    'Field "first" value: formula failed: negative price',
  );
});

test("find stops at the first matching row and the formula has no dependency on later rows", () => {
  let runs = 0;
  const session = open(({ lines }) => (runs++, lines.find((line) => line.quantity > 1)?.name));
  assert.equal(probeOf(session), "b");
  const [first, , third] = keys(session);
  runs = 0;
  session.row("lines", third).edit("quantity", 9);
  session.row("lines", third).edit("name", "z");
  // The first line was read for its quantity only.
  session.row("lines", first).edit("name", "A");
  assert.equal(runs, 0);
  session.row("lines", first).edit("quantity", 5);
  assert.equal(runs, 1);
  assert.equal(probeOf(session), "A");
});

test("Collection, row, and header views are read-only", () => {
  let outcomes;
  const session = open((values) => {
    const { lines } = values;
    outcomes = [
      () => {
        lines[0] = {};
      },
      () => lines.push({}),
      () => {
        lines.length = 0;
      },
      () => delete lines[0],
      () => lines.splice(0, 1),
      () => {
        lines[0].quantity = 9;
      },
      () => delete lines[0].name,
      () => Object.defineProperty(lines[0], "extra", { value: 1 }),
      () => {
        values.note = "x";
      },
    ].map((attempt) => outcome(attempt));
  });
  assert.deepEqual(
    outcomes,
    Array.from({ length: 9 }, () => "TypeError"),
  );
  assert.deepEqual(
    session.getSnapshot().values.lines.map((line) => line.name),
    ["a", "b", "c"],
  );
});

test("Reading only length makes the formula run when rows move even if the length stays the same, and row edits leave it untouched", () => {
  let runs = 0;
  const session = open(({ lines }) => (runs++, String(lines.length)));
  const [first, , third] = keys(session);
  runs = 0;
  // Editing a row changes the array of values, which is no dependency.
  session.row("lines", first).edit("quantity", 7);
  session.patch({ lines: { [third]: { name: "z" } } });
  assert.equal(runs, 0);
  session.move("lines", third, 0);
  assert.equal(runs, 1);
  assert.equal(probeOf(session), "3");
});

test("Editing a row field the formula did not read triggers no recalculation", () => {
  let runs = 0;
  const session = open(
    ({ lines }) => (runs++, String(lines.reduce((total, line) => total + line.quantity, 0))),
  );
  const [first, second] = keys(session);
  runs = 0;
  session.row("lines", second).edit("name", "B");
  session.edit("note", "x");
  assert.equal(runs, 0);
  session.row("lines", first).edit("quantity", 4);
  assert.equal(runs, 1);
  assert.equal(probeOf(session), "9");
  session.remove("lines", [second]);
  assert.equal(runs, 2);
  assert.equal(probeOf(session), "7");
});

test("A view retained and read outside the formula creates no late dependencies", () => {
  let runs = 0;
  let retained;
  const session = open(({ lines }) => {
    runs++;
    retained = lines;
    return lines[0].name;
  });
  const [first, second, third] = keys(session);
  // Reading every row after the run records nothing.
  void JSON.stringify(retained);
  void retained[1].quantity;
  runs = 0;
  session.row("lines", second).edit("quantity", 8);
  session.row("lines", third).edit("name", "z");
  assert.equal(runs, 0);
  session.row("lines", first).edit("name", "A");
  assert.equal(runs, 1);
  assert.equal(probeOf(session), "A");
});

test("A row rule that reads values.lines runs on move and add, and peek.values.lines avoids depending on the collection", () => {
  const runs = { first: 0, count: 0 };
  const session = createSession(
    defineForm({
      fields: {},
      collections: {
        lines: { fields: { name: field.text(), first: field.checkbox(), count: field.number() } },
      },
      rules: {
        lines: {
          each: {
            first: {
              value: (row, { values }) => (runs.first++, values.lines[0].name === row.name),
            },
            count: { value: (_, { peek }) => (runs.count++, peek.values.lines.length) },
          },
        },
      },
    }),
    { initial: { lines: [{ name: "a" }, { name: "b" }] } },
  );
  const column = (name) => session.getSnapshot().values.lines.map((line) => line[name]);
  const [, second] = keys(session);
  runs.first = 0;
  runs.count = 0;
  session.move("lines", second, 0);
  assert.deepEqual(column("name"), ["b", "a"]);
  assert.deepEqual(column("first"), [true, false]);
  assert.deepEqual(runs, { first: 2, count: 0 });
  // The new row runs both formulas; the others, only the one that read the collection.
  session.add("lines", [{ name: "c" }]);
  assert.deepEqual(runs, { first: 5, count: 1 });
  assert.deepEqual(column("count"), [2, 2, 3]);
});
