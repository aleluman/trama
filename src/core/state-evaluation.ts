// A formula of state as it runs: a state property of its field, or a states
// patch for several fields, checked into the contribution it makes.
import { fieldAt, isPlainRecord } from "./fields.js";
import type { Fields } from "./definition.js";
import type { Compiled } from "./compiled.js";
import { runFormula, type Context, type Read, type Reads } from "./reads.js";
import type { Source } from "./views.js";
import { describe, ownEntries, sameItems } from "./data.js";
import type { StateFormula } from "./rules.js";
import type { Contribution } from "./states.js";
import {
  contributionOf,
  expectedOf,
  hasState,
  isLimit,
  isStateProperty,
  type Contributed,
  type StateProperty,
} from "./state-properties.js";

// A formula of state returns its contribution, or undefined when it withdraws
// it; anything else rejects the operation. A limit is checked against the
// type of its field.
export const evaluateState = (
  compiled: Compiled,
  rule: StateFormula,
  source: Source,
  read: Read,
  context: Context,
): { readonly contribution: Contribution | undefined; readonly reads: Reads } => {
  const fields = rule.row?.collection.fields ?? compiled.fields;
  if (rule.kind === "states") {
    const { result, reads } = runFormula(rule, source, read, context, entries);
    return { contribution: patchOf(fields, rule.label, result as Entries), reads };
  }
  const { result, reads } = runFormula(rule, source, read, context);
  const { property } = rule;
  const type = isLimit(property) ? fieldAt(fields, rule.name as string)?.type : undefined;
  const contribution = contributionOf(property, result, type);
  if (contribution === null)
    throw new Error(
      `${rule.label}: incompatible result ${describe(result)}, expected ${expectedOf(property, type)}`,
    );
  return { contribution, reads };
};

// Whether a formula of state contributes again what it contributed before.
export const sameContribution = (a: Contribution | undefined, b: Contribution | undefined) =>
  a === b ||
  (typeof a === "object" &&
    typeof b === "object" &&
    sameItems(a, b, (item, index) => sameItems(item, b[index] ?? [])));

// A states patch read two levels deep, while its formula runs.
type Entries =
  | { readonly patch: false; readonly value: unknown }
  | {
      readonly patch: true;
      readonly destinations: readonly (readonly [
        key: PropertyKey,
        value: unknown,
        properties: readonly (readonly [PropertyKey, unknown])[] | undefined,
      ])[];
    };
const entries = (value: unknown): Entries =>
  isPlainRecord(value)
    ? {
        patch: true,
        destinations: ownEntries(value).map(([key, destination]) => [
          key,
          destination,
          isPlainRecord(destination) ? ownEntries(destination) : undefined,
        ]),
      }
    : { patch: false, value };

// Every destination and property is checked, also those that withdraw.
const patchOf = (fields: Fields, prefix: string, read: Entries): Contribution | undefined => {
  if (!read.patch) {
    if (read.value === undefined) return undefined;
    throw new Error(`${prefix}: expected a state patch object, got ${describe(read.value)}`);
  }
  const set: [string, StateProperty, Contributed][] = [];
  for (const [key, destination, properties] of read.destinations) {
    const item = fieldAt(fields, key);
    if (item === undefined) throw new Error(`${prefix}: unknown field ${describe(key)}`);
    const name = key as string;
    if (destination === undefined) continue;
    if (properties === undefined)
      throw new Error(
        `${prefix}: expected an object of state properties for field "${name}", got ${describe(destination)}`,
      );
    for (const [property, value] of properties) {
      if (!isStateProperty(property))
        throw new Error(`${prefix}: unknown property ${describe(property)} for field "${name}"`);
      if (!hasState(item.type, property))
        throw new Error(`${prefix}: ${item.type} field "${name}" has no ${property}`);
      const contribution = contributionOf(property, value, item.type);
      if (contribution === null)
        throw new Error(
          `${prefix}: incompatible ${property} ${describe(value)} for field "${name}", expected ${expectedOf(property, item.type)}`,
        );
      if (contribution !== undefined) set.push([name, property, contribution]);
    }
  }
  return set.length === 0 ? undefined : set;
};
