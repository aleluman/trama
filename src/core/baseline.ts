// The starting values of a session: the default value of each field, which
// the defaults of its form may give from the context, and initial over them.
import {
  accepts,
  adopt,
  fieldAt,
  isPlainRecord,
  isRecord,
  validateValue,
  wrapError,
  type FieldDefinition,
} from "./fields.js";
import type { Compiled } from "./compiled.js";
import type { Context, Given } from "./reads.js";
export type { Context, Given } from "./reads.js";
import { createDeriver } from "./derived-fields.js";
import { describe, ownEntries } from "./data.js";
import { incompatibleValue } from "./patches.js";
import { newRows, type NewRow } from "./commands.js";

type Values = Record<string, unknown>;

// The default value of each field in a session: the value the defaults of the
// form give from its context, or the default of the field, which every
// session shares. An option is a frozen copy, apart from the object the
// defaults returned.
export const defaultsOf = (compiled: Compiled, context: Context): Readonly<Values> => {
  if (compiled.defaults === undefined) return compiled.fieldDefaults;
  const values: Values = { ...compiled.fieldDefaults };
  let result: unknown;
  let found: (readonly [PropertyKey, unknown])[] = [];
  try {
    result = compiled.defaults(context as object);
    if (isPlainRecord(result)) found = ownEntries(result);
  } catch (cause) {
    throw wrapError("Form defaults: formula failed", cause);
  }
  if (!isPlainRecord(result))
    throw new Error(`Form defaults: expected an object of values, got ${describe(result)}`);
  for (const [key, value] of found) {
    const item = fieldAt(compiled.fields, key);
    if (item === undefined) throw new Error(`Form defaults: unknown field ${describe(key)}`);
    if (!accepts(item, value)) throw incompatibleValue("Form defaults", item, key as string, value);
    values[key as string] = adopt(item, value, []);
  }
  return values;
};

// The baseline takes the default values of the session, and initial over them;
// the rows of each collection come from initial, none if it gives none.
export const createBaseline = (
  compiled: Compiled,
  defaults: Readonly<Values>,
  initial: unknown,
) => {
  const values: Values = { ...defaults };
  const rows = new Map<string, readonly NewRow[]>();
  if (initial !== undefined && !isRecord(initial))
    throw new Error("Initial values must be an object");
  const supplied = Object.entries(initial ?? {}).filter(
    ([name]) => !compiled.collections.has(name),
  );
  for (const [name, value] of supplied) validateValue(name, fieldAt(compiled.fields, name), value);
  for (const [name, collection] of compiled.collections) {
    const given = (initial as Values | undefined)?.[name];
    rows.set(
      name,
      given === undefined ? [] : newRows(collection, `Collection "${name}" initial`, given),
    );
  }
  // A supplied option is a frozen copy, apart from the author's object.
  for (const [name, value] of supplied)
    values[name] = adopt(compiled.fields[name] as FieldDefinition, value, []);
  // A field of initial prevails over its formula when initial has it as its
  // own property, also one that is not enumerable and gives no value.
  const given = Object.keys(compiled.fields).filter(
    (name) => initial !== undefined && Object.hasOwn(initial, name),
  );
  return { values, rows, supplied: new Set(given) };
};

// What a session is given: its context, the defaults of its form with it, and
// the deriver of the states it publishes, with the messages of its form.
export const givenOf = (compiled: Compiled, context: Context): Given => ({
  context,
  defaults: defaultsOf(compiled, context),
  deriver: createDeriver(compiled.messages),
});
