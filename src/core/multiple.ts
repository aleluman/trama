// The values of the multiple fields: a selection is an array without order and
// without repeats. Writing the same members in another order keeps the array
// the field holds, so it changes nothing.
import {
  copiedArray,
  copyData,
  dataProblem,
  describe,
  isCopy,
  isOption,
  type OptionShape,
} from "./data.js";
import type { SelectOption } from "./field-definitions.js";

// Why a value is not an array a selection can hold: a plain array, without
// holes, symbols, accessors or other properties. Its members are checked
// before any is read, so no code of the author runs. A copy has none of them
// but holes.
const containerProblem = (value: unknown) => {
  if (!Array.isArray(value)) return "expected an array without holes";
  const copy = isCopy(value);
  for (let index = 0; index < value.length; index += 1) {
    const member = Object.getOwnPropertyDescriptor(value, index);
    if (member === undefined) return "expected an array without holes";
    if (!copy && (!("value" in member) || member.enumerable !== true))
      return dataProblem(value, "selection");
  }
  if (
    copy ||
    (Object.getPrototypeOf(value) === Array.prototype &&
      Reflect.ownKeys(value).length === value.length + 1)
  )
    return;
  return dataProblem(value, "selection") ?? "expected an array without holes";
};

// The values of the options of a static field. The copy of a definition, whose
// options Trama froze, keeps its set; the author's object, whose default is
// checked before it is copied, may still change, so its set is built each time.
const domains = new WeakMap<object, ReadonlySet<unknown>>();
type Choices = { readonly options: readonly SelectOption[] };
const domainOf = (item: Choices) =>
  domains.get(item) ?? new Set(item.options.map((option) => option.value));
// Keeps the set of the copy of a definition, once its options are frozen.
export const withDomain = <D extends Choices>(item: D): D => {
  domains.set(item, new Set(item.options.map((option) => option.value)));
  return item;
};

// Why a value is not a selection of the options of a static field.
export const valuesProblem = (item: Choices, value: unknown): string | undefined => {
  const container = containerProblem(value);
  if (container !== undefined) return container;
  const domain = domainOf(item);
  const seen = new Set<unknown>();
  for (const member of value as readonly unknown[]) {
    if (!domain.has(member)) return `value ${describe(member)} is not an option`;
    if (seen.has(member)) return `duplicate value ${describe(member)}`;
    seen.add(member);
  }
};

// Why a value is not a selection of options: each one a plain option, with a
// value that no other repeats. A valid selection is walked once; only a
// rejected one is walked option by option, to name the first problem.
export const optionsProblem = (value: unknown): string | undefined => {
  const container = containerProblem(value);
  if (container !== undefined) return container;
  const members = value as readonly unknown[];
  if (
    members.every((member) => isOption(member)) &&
    new Set(members.map((member) => (member as OptionShape).value)).size === members.length &&
    dataProblem(members, "selection") === undefined
  )
    return;
  const seen = new Set<unknown>();
  for (const [index, member] of members.entries()) {
    if (!isOption(member)) return `option ${index}: expected value and label`;
    const problem = dataProblem(member, "option");
    if (problem !== undefined) return `option ${index}: ${problem}`;
    if (seen.has(member.value)) return `duplicate option value ${describe(member.value)}`;
    seen.add(member.value);
  }
};

// Whether two selections have the same members. Neither has repeats, so the
// same length and every member make the same set. The members of the second,
// the baseline or an array a field holds, are kept per array, which never
// changes.
const memberSets = new WeakMap<readonly unknown[], ReadonlySet<unknown>>();
export const sameSet = <T>(a: readonly T[], b: readonly T[], key: (member: T) => unknown) => {
  if (a.length !== b.length) return false;
  let members = memberSets.get(b);
  if (members === undefined) {
    members = new Set(b.map((member) => key(member)));
    memberSets.set(b, members);
  }
  const held = members;
  return a.every((member) => held.has(key(member)));
};

// The array a field holds with the same members as value, if any.
const sameMembers = <T>(
  value: readonly T[],
  held: readonly unknown[],
  key: (member: T) => unknown,
) => {
  if (held.includes(value)) return value;
  for (const kept of new Set(held))
    if (Array.isArray(kept) && sameSet(value, kept as readonly T[], key))
      return kept as readonly T[];
};

// The selection a write of a static field stores: the one held with the same
// values, a copy that a write stored before, or a frozen copy.
export const adoptValues = <V>(value: readonly V[], held: readonly unknown[]) =>
  sameMembers(value, held, (member) => member) ?? (isCopy(value) ? value : copiedArray([...value]));

// The selection a write of options stores: the one held with the same values,
// or a frozen array that keeps each option held with its value, the one of the
// start first, and copies the new ones together.
export const adoptOptions = <O extends OptionShape>(
  value: readonly O[],
  held: readonly unknown[],
): readonly O[] => {
  const same = sameMembers(value, held, (option) => option.value);
  if (same !== undefined) return same;
  const kept = new Map<unknown, O>();
  for (const array of new Set(held))
    if (Array.isArray(array))
      for (const option of array as readonly O[])
        if (!kept.has(option.value)) kept.set(option.value, option);
  // A copy, as the one a write stored before, keeps its identity unless a held
  // option takes the place of one of its own, so an attempt that starts again
  // writes the same array.
  if (isCopy(value) && value.every((option) => (kept.get(option.value) ?? option) === option))
    return value;
  const fresh = value.filter((option) => !kept.has(option.value));
  const copied = new Map(
    (copyData(fresh, "selection") as readonly O[]).map((option) => [option.value, option]),
  );
  return copiedArray(
    value.map((option) => kept.get(option.value) ?? (copied.get(option.value) as O)),
  );
};
