import { accepts, fieldAt, isPlainRecord, problemOf, wrapError } from "./fields.js";
import { describe } from "./data.js";
import type { Compiled } from "./compiled.js";
import { formPatch, readPatch, rowPatch } from "./patches.js";
import { runFormula, toolsWith, tracked, type Context, type Given, type Read } from "./reads.js";
import { viewsOf, type EditValue, type Source } from "./views.js";
import type { FieldEvent, FieldFormula } from "./rules.js";
import type { RowRecord } from "./tree.js";

export type RowBefore = { readonly row: RowRecord; readonly values: RowRecord };

// A value formula writes its result unless it returns undefined.
export const evaluateFormula = (
  rule: FieldFormula,
  source: Source,
  read: Read,
  context: Context,
) => {
  const { result: value, reads } = runFormula(rule, source, read, context);
  if (value !== undefined && !accepts(rule.item, value)) {
    const problem = problemOf(rule.item, value);
    throw new Error(
      problem === undefined
        ? `${rule.label}: incompatible result ${describe(value)} for a ${rule.item.type} field`
        : `${rule.label}: incompatible result for ${rule.item.type} field: ${problem}`,
    );
  }
  return { value, reads };
};

// An event reads resolved values as data and returns the fields it writes; a
// value left undefined is not written. The whole patch is read once and checked
// before anything is written. toDefaults gives the default values of the
// session, or the static ones of the row. An event of the header also gets the
// keys of each collection, and writes rows with a nested patch; an event of a
// row writes its own row.
export const evaluateEvent = (
  compiled: Compiled,
  event: FieldEvent,
  source: Source,
  read: Read,
  { context, defaults }: Given,
  before: RowRecord | RowBefore,
  edit?: EditValue,
) => {
  const prefix = event.label;
  const reads = tracked(read);
  const views = viewsOf(source, reads.read, "Event values are readonly", edit);
  const { row } = event;
  const fields = row?.collection.fields ?? compiled.fields;
  const initial = row === undefined ? defaults : row.collection.fieldDefaults;
  const toDefaults = (...names: unknown[]) =>
    Object.fromEntries(
      names.map((name) => {
        if (typeof name !== "string" || fieldAt(fields, name) === undefined)
          throw reads.fail(new Error(`${prefix}: toDefaults: unknown field ${describe(name)}`));
        return [name, initial[name]];
      }),
    );
  const [values, tools] =
    row === undefined
      ? [views.form(true), { toDefaults, rows: views.rows(), before }]
      : [views.row(row, true), { toDefaults, values: views.form(true), key: row.key, before }];
  let result: unknown;
  let found: readonly (readonly [PropertyKey, unknown])[] = [];
  try {
    result = event.handler(values, toolsWith(tools, context));
    if (isPlainRecord(result))
      found = readPatch(result, row === undefined ? compiled.collections : undefined);
  } catch (cause) {
    throw reads.failure() ?? wrapError(`${prefix}: event failed`, cause);
  } finally {
    views.stop();
  }
  const failure = reads.failure();
  if (failure !== undefined) throw failure;
  if (result === undefined) return { patch: undefined, reads: views.reads };
  if (!isPlainRecord(result))
    throw new Error(`${prefix}: expected a patch object, got ${describe(result)}`);
  const patch =
    row === undefined
      ? formPatch(prefix, compiled.fields, compiled.collections, source.tree, found)
      : rowPatch(prefix, row, found);
  return { patch, reads: views.reads };
};
