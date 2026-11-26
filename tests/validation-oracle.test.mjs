import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { pick, random } from "./helpers/session.mjs";

// A slow oracle for validation: from the values, the baseline and the published state of
// each field, it recomputes the built-in validation, dirty and the counts of
// every scope. It does not evaluate the rules again: their messages are read
// from what the session published. The lock changes no message, and an error
// and a warning of the rows read the header.
const form = defineForm({
  fields: {
    limit: field.number(),
    note: field.text({ required: true }),
    flag: field.checkbox(),
    lock: field.checkbox(),
  },
  collections: {
    lines: {
      fields: {
        qty: field.number({ max: 10 }),
        name: field.text(),
        tags: field.multiSelect({
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        }),
      },
    },
  },
  rules: {
    lines: {
      each: {
        qty: {
          min: (_, { values }) => values.limit ?? undefined,
          error: (_, { values }) => values.note === "e" && "Check",
        },
        name: { required: (_, { values }) => values.flag },
        tags: { warning: (_, { values }) => values.note === "w" && "Check" },
      },
      row: { error: ({ qty, name }) => qty === 0 && name === "" && "Empty" },
      collection: { warning: ({ lines }) => lines.length > 3 && "Many" },
    },
  },
  form: {
    error: ({ note }) => note === "x" && "Note x",
    readOnly: { value: ({ lock }) => lock, except: ["lock"] },
  },
});
const types = {
  limit: "number",
  note: "text",
  flag: "checkbox",
  lock: "checkbox",
  qty: "number",
  name: "text",
  tags: "multiSelect",
};
const missing = (type, value) =>
  type === "text"
    ? value === ""
    : type === "checkbox"
      ? value === false
      : type === "multiSelect"
        ? value.length === 0
        : value === null;
const equal = (type, a, b) =>
  type === "multiSelect"
    ? a.length === b.length && a.every((member) => b.includes(member))
    : Object.is(a, b);
const builtIn = (type, value, state) => {
  if (missing(type, value)) return state.required ? "Required" : undefined;
  if (state.min !== undefined && value < state.min) return `Minimum ${state.min}`;
  if (state.max !== undefined && value > state.max) return `Maximum ${state.max}`;
};

const checkField = (name, value, base, created, state, where) => {
  const expected = builtIn(types[name], value, state);
  if (expected === undefined)
    assert.ok(
      !state.errors.some((error) => /^(Required|Minimum|Maximum)/u.test(error)),
      `${where} ${name}`,
    );
  else assert.equal(state.errors[0], expected, `${where} ${name}`);
  assert.equal(state.dirty, created || !equal(types[name], value, base), `${where} dirty ${name}`);
  return {
    errors: state.errors.length > 0,
    warnings: state.warnings.length > 0,
    dirty: state.dirty,
  };
};
const tally = (results, own) => ({
  errorCount: results.filter((result) => result.errors).length + Number(own.errors.length > 0),
  warningCount:
    results.filter((result) => result.warnings).length + Number(own.warnings.length > 0),
});

// Each row, checked, with what the collection adds up of them.
const checkRows = (session, baseline, where) => {
  const { values, fieldStates, rows } = session.getSnapshot();
  let rowErrors = 0;
  let rowWarnings = 0;
  let dirtyRows = false;
  rows.lines.forEach((key, index) => {
    const row = session.row("lines", key).getSnapshot();
    const base = baseline.records.get(key);
    const results = ["qty", "name", "tags"].map((name) =>
      checkField(
        name,
        values.lines[index][name],
        base?.[name],
        base === undefined,
        fieldStates.lines[index][name],
        `${where} ${key}`,
      ),
    );
    const counts = tally(results, row);
    assert.deepEqual(
      [row.errorCount, row.warningCount],
      [counts.errorCount, counts.warningCount],
      `${where} ${key}`,
    );
    assert.equal(
      row.dirty,
      base === undefined || results.some((result) => result.dirty),
      `${where} ${key} dirty`,
    );
    rowErrors += counts.errorCount;
    rowWarnings += counts.warningCount;
    dirtyRows ||= row.dirty;
  });
  return { rowErrors, rowWarnings, dirtyRows };
};

const oracle = (session, baseline, where) => {
  const { values, fieldStates, rows, form: state } = session.getSnapshot();
  const header = ["limit", "note", "flag", "lock"].map((name) =>
    checkField(name, values[name], baseline.values[name], false, fieldStates[name], where),
  );
  const { rowErrors, rowWarnings, dirtyRows } = checkRows(session, baseline, where);
  const lines = state.collections.lines;
  const moved =
    rows.lines.length !== baseline.keys.length ||
    rows.lines.some((key, index) => key !== baseline.keys[index]);
  assert.deepEqual(
    [lines.errorCount, lines.warningCount, lines.dirty],
    [
      rowErrors + Number(lines.errors.length > 0),
      rowWarnings + Number(lines.warnings.length > 0),
      moved || dirtyRows,
    ],
    `${where} lines`,
  );
  const own = tally(header, state);
  assert.deepEqual(
    [state.errorCount, state.warningCount, state.dirty],
    [
      own.errorCount + lines.errorCount,
      own.warningCount + lines.warningCount,
      header.some((result) => result.dirty) || lines.dirty,
    ],
    `${where} form`,
  );
};

const step = (session, next) => {
  const keys = session.getSnapshot().rows.lines;
  const key = keys.length > 0 ? pick(next, keys) : undefined;
  const kind = pick(next, [
    "header",
    "header",
    "cell",
    "cell",
    "cell",
    "add",
    "remove",
    "move",
    "same",
    "reset",
    "patch",
  ]);
  if (kind === "header") {
    const name = pick(next, ["limit", "note", "flag", "lock"]);
    const value = {
      limit: pick(next, [null, 0, 2, 5, 20]),
      note: pick(next, ["", "a", "x", "w", "e"]),
      flag: next() < 0.5,
      lock: next() < 0.5,
    }[name];
    session.edit(name, value);
  } else if (kind === "cell" && key !== undefined) {
    const name = pick(next, ["qty", "name", "tags"]);
    const value = {
      qty: pick(next, [null, 0, 3, 11]),
      name: pick(next, ["", "b"]),
      tags: pick(next, [[], ["a"], ["b", "a"], ["a", "b"]]),
    }[name];
    session.row("lines", key).edit(name, value);
  } else if (kind === "add")
    session.add("lines", [pick(next, [{}, { qty: 4 }, { name: "n" }])], {
      at: Math.floor(next() * (keys.length + 1)),
    });
  else if (kind === "remove" && key !== undefined) session.remove("lines", [key]);
  else if (kind === "move" && key !== undefined)
    session.move("lines", key, Math.floor(next() * keys.length));
  else if (kind === "same") session.edit("note", session.getSnapshot().values.note);
  else if (kind === "reset") session.reset();
  else if (kind === "patch")
    session.patch({ limit: pick(next, [1, 15]), note: pick(next, ["", "b"]) });
};

test("the oracle matches what is published after each fuzz operation, including rejected operations", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed);
    const session = createSession(form, {
      initial: { note: "n", lines: [{ qty: 1, name: "a", tags: ["a"] }, {}, { qty: 12 }] },
    });
    const opened = session.getSnapshot();
    const baseline = {
      values: opened.values,
      keys: opened.rows.lines,
      records: new Map(opened.rows.lines.map((key, index) => [key, opened.values.lines[index]])),
    };
    oracle(session, baseline, `seed ${seed} open`);
    for (let index = 0; index < 60; index++) {
      const before = session.getSnapshot();
      try {
        step(session, next);
      } catch {
        assert.equal(session.getSnapshot(), before, `seed ${seed} step ${index} rejected`);
      }
      oracle(session, baseline, `seed ${seed} step ${index}`);
    }
  }
});
