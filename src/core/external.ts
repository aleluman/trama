// What the sources of a session give one destination from outside its rules:
// the errors and the warnings of each source, and the two lists the
// destination publishes, each text once, in the order its sources were first
// declared and, within a source, that of its list. Replacing a source leaves
// the others as they were.
import { sameItems } from "./data.js";

export type Channel = "errors" | "warnings";
type Lists = { readonly errors: readonly string[]; readonly warnings: readonly string[] };
// The sources are numbered in the order they were declared.
export type External = Lists & { readonly sources: ReadonlyMap<number, Lists> };

export const noMessages: readonly string[] = Object.freeze([]);
const noLists: Lists = Object.freeze({ errors: noMessages, warnings: noMessages });

// The external of a destination with one channel of a source replaced by a
// list without repeats: the same object when the list is the same, and
// undefined when no source gives it anything any more.
export const withSource = (
  external: External | undefined,
  source: number,
  channel: Channel,
  list: readonly string[],
): External | undefined => {
  const held = external?.sources.get(source) ?? noLists;
  if (sameItems(held[channel], list)) return external;
  const sources = new Map(external?.sources);
  const lists = { ...held, [channel]: list };
  if (lists.errors.length === 0 && lists.warnings.length === 0) sources.delete(source);
  else sources.set(source, lists);
  if (sources.size === 0) return;
  const published = keptItems(listed(sources, channel), external?.[channel]);
  return Object.freeze({ ...(external ?? noLists), [channel]: published, sources });
};

// The texts of a channel, by source in declaration order, each once.
const listed = (sources: ReadonlyMap<number, Lists>, channel: Channel) => {
  const texts: string[] = [];
  const order = [...sources.keys()];
  order.sort((a, b) => a - b);
  for (const source of order)
    for (const text of (sources.get(source) as Lists)[channel])
      if (!texts.includes(text)) texts.push(text);
  return texts.length === 0 ? noMessages : texts;
};

// Two lists as one, each text once, the first ones first: one of them when
// the other adds nothing.
export const merged = (first: readonly string[], second: readonly string[]) => {
  if (second.length === 0) return first;
  if (first.length === 0) return second;
  const added = second.filter((text) => !first.includes(text));
  return added.length === 0 ? first : Object.freeze([...first, ...added]);
};

// A list of messages, or the one before while its items are the same.
export const keptItems = (list: readonly string[], before: readonly string[] | undefined) =>
  before !== undefined && sameItems(before, list) ? before : Object.freeze(list);
