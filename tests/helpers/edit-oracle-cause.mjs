import { isDeepStrictEqual } from "node:util";
import { relationAt, relationDefaults } from "./relation-fuzz.mjs";

export const member = (collection, key, field) => `${collection}${key}.${field}`;
export const local = ({ scope, key }, name) => (scope === null ? name : member(scope, key, name));
const empty = () => ({ values: new Map(), rows: new Map() });
export const copy = ({ values, rows }) => ({ values: new Map(values), rows: new Map(rows) });
const remoteField = (field) => field === "a" || field.endsWith(".fa");
export const equal = (field, left, right) =>
  remoteField(field) && left?.value !== undefined && right?.value !== undefined
    ? Object.is(left.value, right.value)
    : Object.is(left, right);

export const boardOf = ({ header, rows }) => {
  const board = { values: new Map(Object.entries(header)), rows: new Map() };
  for (const [collection, records] of Object.entries(rows)) {
    board.rows.set(
      collection,
      records.map(([key]) => key),
    );
    for (const [key, values] of records)
      for (const [field, value] of Object.entries(values))
        board.values.set(member(collection, key, field), value);
  }
  return board;
};

const putRelation = (candidate, supplied, spec, defaults, record) => {
  for (const [name, fallback] of Object.entries(defaults)) {
    const field = local(spec, name);
    const given = Object.hasOwn(record, name);
    candidate.values.set(field, given ? record[name] : fallback);
    if (given) supplied.add(field);
  }
};

const putRows = (form, candidate, collection, keys, records, supplied) => {
  const scope = collection.name;
  const defaults = relationDefaults(relationAt(form, scope));
  keys.forEach((key, index) => {
    const record = records[index];
    for (const name of collection.numbers) {
      const field = member(collection.name, key, name);
      candidate.values.set(field, record[name] ?? 0);
      if (Object.hasOwn(record, name)) supplied.add(field);
    }
    if (collection.async) candidate.values.set(member(collection.name, key, "fa"), null);
    putRelation(candidate, supplied, { scope, key }, defaults, record);
  });
};

const open = (form, candidate, supplied) => {
  form.numbers.forEach((name, index) => candidate.values.set(name, index === 0 ? 1 : 0));
  candidate.values.set("t", "");
  candidate.values.set("a", null);
  putRelation(
    candidate,
    supplied,
    { scope: null },
    relationDefaults(relationAt(form, null)),
    form.initial,
  );
  let next = 0;
  for (const collection of form.collections) {
    const records = form.initial[collection.name];
    const first = next;
    const opened = records.map((_, index) => `#${first + index}`);
    next += records.length;
    candidate.rows.set(collection.name, opened);
    putRows(form, candidate, collection, opened, records, supplied);
  }
};

const rowBy = (board, collection, index) => {
  const keys = board.rows.get(collection);
  return keys[index % keys.length];
};

const commandWrites = (candidate, kind, args) => {
  const written = new Map();
  const writeRow = (collection, index, name, value) => {
    const key = rowBy(candidate, collection, index);
    if (key !== undefined) written.set(member(collection, key, name), value);
  };
  if (kind === "edit" || kind === "patch") written.set(args[0], args[1]);
  if (kind === "rowEdit") writeRow(...args);
  if (kind === "patch") writeRow(...args.slice(2));
  if (kind === "patchFields") {
    const [header, row] = args;
    for (const [field, value] of header) written.set(field, value);
    if (row) for (const [field, value] of row[2]) writeRow(row[0], row[1], field, value);
  }
  return written;
};

const reshape = (form, candidate, supplied, kind, args) => {
  if (kind === "open") {
    open(form, candidate, supplied);
    return true;
  }
  if (kind === "add") {
    const [scope, count, index, entries] = args;
    const previous = candidate.rows.get(scope);
    const added = Array.from({ length: count }, (_, ordinal) => `#new${ordinal}`);
    candidate.rows.set(scope, previous.toSpliced(index % (previous.length + 1), 0, ...added));
    const collection = form.collections.find(({ name }) => name === scope);
    putRows(
      form,
      candidate,
      collection,
      added,
      added.map(() => Object.fromEntries(entries)),
      supplied,
    );
    return true;
  }
  if (kind === "remove" || kind === "move") {
    const [scope, index, to] = args;
    const previous = candidate.rows.get(scope);
    const key = rowBy(candidate, scope, index);
    if (key === undefined) return false;
    const next = previous.toSpliced(index % previous.length, 1);
    if (kind === "move") next.splice(to % previous.length, 0, key);
    else {
      const collection = form.collections.find(({ name }) => name === scope);
      const related = Object.keys(relationDefaults(relationAt(form, scope)));
      for (const field of [...collection.numbers, "fa", ...related])
        candidate.values.delete(member(scope, key, field));
    }
    candidate.rows.set(scope, next);
    return !isDeepStrictEqual(next, previous);
  }
  return false;
};

export const causeOf = (form, prior, [kind, ...args]) => {
  const candidate = prior ? copy(prior) : empty();
  const supplied = new Set();
  const changed = new Map();
  const structural = reshape(form, candidate, supplied, kind, args);
  const written = commandWrites(candidate, kind, args);
  for (const [field, value] of written)
    if (!equal(field, candidate.values.get(field), value)) {
      changed.set(field, value);
      candidate.values.set(field, value);
    }
  return {
    prior,
    candidate,
    supplied,
    written,
    changed,
    before: prior,
    kind,
    runs: structural || changed.size > 0,
  };
};

// Row keys of an add are opaque; rename only its fresh identities, not values or order.
export const identify = (actual, cause) => {
  const addresses = new Map();
  if (cause.kind !== "add") return { board: actual, addresses };
  const renamed = copy(actual);
  for (const [scope, keys] of cause.candidate.rows) {
    const existing = cause.prior.rows.get(scope);
    const newKeys = actual.rows.get(scope).filter((key) => !existing.includes(key));
    const aliases = new Map(
      keys.filter((key) => key.startsWith("#new")).map((key, index) => [newKeys[index], key]),
    );
    renamed.rows.set(
      scope,
      actual.rows.get(scope).map((key) => aliases.get(key) ?? key),
    );
    for (const [address, value] of actual.values) {
      if (!address.startsWith(`${scope}#`)) continue;
      const [key, field] = address.slice(scope.length).split(".");
      if (!aliases.has(key)) continue;
      renamed.values.delete(address);
      const alias = member(scope, aliases.get(key), field);
      renamed.values.set(alias, value);
      addresses.set(alias, address);
    }
  }
  return { board: renamed, addresses };
};

export const fieldValue = (board, address) =>
  address.startsWith(":") ? board.rows.get(address.slice(1)) : board.values.get(address);

export const changedSince = (board, prior, reads) =>
  [...reads].some(
    (field) => !isDeepStrictEqual(fieldValue(board, field), fieldValue(prior, field)),
  );

export const distinct = (wanted, actual) => {
  if (!isDeepStrictEqual(wanted.rows, actual.rows)) return "different structure";
  for (const [field, value] of wanted.values)
    if (!equal(field, value, actual.values.get(field)))
      return `${field}: ${JSON.stringify(actual.values.get(field))} ≠ ${JSON.stringify(value)}`;
  if (wanted.values.size !== actual.values.size) return "different field count";
};
