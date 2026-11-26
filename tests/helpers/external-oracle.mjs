import { createSession, defineForm, field } from "trama-forms/core";
import { pick } from "./session.mjs";

// What the oracles of the external messages share: a form with formulas in
// the header and in each row, and local errors in both; random operations
// that name the rows by their position, so two sessions run the same ones;
// and what a session publishes of its messages in every scope.
export const form = defineForm({
  fields: { a: field.number(), b: field.text({ required: true }), sum: field.number() },
  collections: {
    lines: {
      fields: { x: field.number(), y: field.text({ required: true }), double: field.number() },
    },
  },
  rules: {
    sum: { value: ({ a }) => (a ?? 0) + 1 },
    lines: { each: { double: { value: ({ x }, { values }) => (x ?? 0) * 2 + (values.a ?? 0) } } },
  },
});
export const header = ["a", "b", "sum"];
export const cells = ["x", "y", "double"];
export const open = () =>
  createSession(form, { initial: { a: 1, b: "s", lines: [{ x: 1, y: "s" }, { x: 2 }, {}] } });

const valueOf = (next, name) =>
  name === "b" || name === "y" ? pick(next, ["", "s", "t"]) : pick(next, [null, 1, 2]);

// A random operation on values or rows, with the rows by position.
export const operationOf = (next, length) => {
  const kind = pick(next, ["edit", "edit", "cell", "cell", "cell", "add", "remove", "move"]);
  if (kind === "edit" || length === 0) {
    const name = pick(next, ["a", "b"]);
    return kind === "add" ? { kind, at: 0 } : { kind: "edit", name, value: valueOf(next, name) };
  }
  const index = Math.floor(next() * length);
  if (kind === "cell") {
    const name = pick(next, ["x", "y"]);
    return { kind, index, name, value: valueOf(next, name) };
  }
  if (kind === "add") return { kind, at: Math.floor(next() * (length + 1)) };
  return kind === "remove" ? { kind, index } : { kind, index, to: Math.floor(next() * length) };
};
export const run = (session, operation) => {
  const keys = session.getSnapshot().rows.lines;
  const { kind, index, name, value } = operation;
  if (kind === "edit") session.edit(name, value);
  else if (kind === "cell") session.row("lines", keys[index]).edit(name, value);
  else if (kind === "add") session.add("lines", [{}], { at: operation.at });
  else if (kind === "remove") session.remove("lines", [keys[index]]);
  else session.move("lines", keys[index], operation.to);
};

// Random places for messages among the rows at these keys: the form, a field
// of the header, the collection, a row or a cell.
export const placesOf = (next, keys, count) =>
  Array.from({ length: count }, () => {
    const message = pick(next, ["M1", "M2", "M3"]);
    const kind = pick(next, ["form", "field", "field", "lines", "row", "row", "cell", "cell"]);
    if (kind === "form") return { message };
    if (kind === "field") return { field: pick(next, header), message };
    if (kind === "lines" || keys.length === 0) return { collection: "lines", message };
    const key = pick(next, keys);
    return kind === "row"
      ? { collection: "lines", key, message }
      : { collection: "lines", key, field: pick(next, cells), message };
  });

// What a scope publishes of its messages.
const lists = ({ errors, externalErrors, warnings }) => ({ errors, externalErrors, warnings });
const rowOf = (row) =>
  Object.assign(lists(row), {
    counts: [row.errorCount, row.warningCount],
    cells: Object.fromEntries(cells.map((name) => [name, lists(row.fieldStates[name])])),
  });
// The messages of every scope of a session, the rows in visual order, with
// its counts.
export const published = (session) => {
  const { form: scope, fieldStates, rows } = session.getSnapshot();
  return {
    form: { ...lists(scope), counts: [scope.errorCount, scope.warningCount] },
    header: Object.fromEntries(header.map((name) => [name, lists(fieldStates[name])])),
    lines: {
      ...lists(scope.collections.lines),
      counts: [scope.collections.lines.errorCount, scope.collections.lines.warningCount],
    },
    rows: rows.lines.map((key) => rowOf(session.row("lines", key).getSnapshot())),
  };
};
