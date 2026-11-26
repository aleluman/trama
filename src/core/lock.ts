import type { Fields } from "./definition.js";
import { describe } from "./data.js";
import { fieldAt, isPlainRecord } from "./fields.js";
import type { CompiledCollection } from "./collections.js";
import type { RuleFormula } from "./reads.js";
import type { StateFormula } from "./rules.js";

// form takes readOnly: an entry or an array of entries, each with its formula
// and the fields it does not reach. An exception names a field of the header,
// or, in an object by collection, fields of its rows, in every row. The
// exceptions are static, so each entry compiles to readOnly for the fields it
// reaches.
export const lock = (
  fields: Fields,
  collections: ReadonlyMap<string, CompiledCollection>,
  declared: unknown,
): StateFormula[] => {
  if (declared === undefined) return [];
  const many = Array.isArray(declared);
  if (!many && !isPlainRecord(declared))
    throw new Error("Form readOnly: expected an entry or an array of entries");
  return Array.from(many ? declared : [declared], (entry: unknown, index) => {
    const label = many ? `Form readOnly[${index}]` : "Form readOnly";
    if (!isPlainRecord(entry))
      throw new Error(`${label}: expected an object with value and optional except`);
    for (const key of Object.keys(entry))
      if (key !== "value" && key !== "except")
        throw new Error(`${label}: unknown property "${key}"`);
    if (typeof entry.value !== "function") throw new Error(`${label}: formula must be a function`);
    const except = entry.except === undefined ? [] : entry.except;
    if (!Array.isArray(except)) throw new Error(`${label}: except must be an array of fields`);
    const excepted = exceptions(label, fields, collections, except as unknown[]);
    return Object.freeze({
      kind: "property",
      property: "readOnly",
      names: reached(Object.keys(fields), excepted.header),
      rows: new Map(
        Array.from(collections.values(), (collection) => [
          collection.name,
          reached(Object.keys(collection.fields), excepted.rows.get(collection.name)),
        ]),
      ),
      label,
      formula: entry.value as RuleFormula,
      row: undefined,
    });
  });
};

const reached = (names: Iterable<string>, skipped: ReadonlySet<string> | undefined) =>
  Array.from(names).filter((name) => skipped?.has(name) !== true);

// The fields each exception names: of the header, and of the rows of each
// collection. A form without collections takes only names, as before rows.
const exceptions = (
  label: string,
  fields: Fields,
  collections: ReadonlyMap<string, CompiledCollection>,
  except: readonly unknown[],
) => {
  const header = new Set<string>();
  const rows = new Map<string, Set<string>>();
  for (const name of except) {
    if (typeof name === "string" && fieldAt(fields, name) !== undefined) header.add(name);
    else if (collections.size > 0 && isPlainRecord(name))
      for (const [key, names] of Object.entries(name))
        rows.set(key, rowExceptions(label, collections.get(key), key, names, rows.get(key)));
    else throw new Error(`${label}: unknown field ${describe(name)} in except`);
  }
  return { header, rows };
};

// The fields of the rows of a collection that an exception names.
const rowExceptions = (
  label: string,
  collection: CompiledCollection | undefined,
  key: string,
  names: unknown,
  skipped = new Set<string>(),
) => {
  if (collection === undefined) throw new Error(`${label}: unknown collection "${key}" in except`);
  if (!Array.isArray(names))
    throw new Error(`${label}: except of collection "${key}" must be an array of fields`);
  for (const field of names as unknown[]) {
    if (typeof field !== "string" || fieldAt(collection.fields, field) === undefined)
      throw new Error(
        `${label}: unknown field ${describe(field)} of collection "${key}" in except`,
      );
    skipped.add(field);
  }
  return skipped;
};
