import { SeparateCause, wrapError } from "./fields.js";
import type { Address, Row } from "./address.js";
import { viewsOf, type Source } from "./views.js";
import type { Deriver } from "./derived-fields.js";

export type Read = (address: Address) => unknown;
// The fields a run read, each with the value it returned.
export type Reads = ReadonlyMap<Address, unknown>;

export type RuleValues = Readonly<Record<string, unknown>>;
export type RuleFormula = (values: RuleValues, tools: object) => unknown;

// The context of a session: every rule and output receives it next to its own
// tools. undefined when the form declares none, and then the tools lack it.
export type Context = object | undefined;
export const toolsWith = <T extends object>(tools: T, context: Context): Readonly<T> =>
  Object.freeze(context === undefined ? tools : { ...tools, context });
// What a session is given: its context, the defaults it gives, and the deriver
// of the states it publishes, with the messages of its form.
export type Given = {
  readonly context: Context;
  readonly defaults: RuleValues;
  readonly deriver: Deriver;
};

// The first failure a rule reads rejects the operation as it is, naming the
// field that failed; catching it inside the rule cannot hide it.
export const tracked = (read: Read) => {
  let first: Error | undefined;
  return {
    read: (address: Address) => {
      try {
        return read(address);
      } catch (error) {
        if (error instanceof Error) first ??= error;
        throw error;
      }
    },
    fail: (error: Error) => (first ??= error),
    failure: () => first,
  };
};

// The tools of a rule of a row: the values of the form, its key, and peek of
// both. Only the values record dependencies.
const rowTools = (views: ReturnType<typeof viewsOf>, row: Row) => ({
  values: views.form(true),
  key: row.key,
  peek: Object.freeze({ row: views.row(row, false), values: views.form(false) }),
});

const same = (result: unknown) => result;

// Runs a formula with values and peek, which both resolve the field they read
// first; only values records a dependency. The context is no dependency.
// settle reads the result while the formula still owns it, so a getter that
// throws fails the formula.
export const runFormula = (
  rule: { readonly label: string; readonly formula: RuleFormula; readonly row?: Row | undefined },
  source: Source,
  read: Read,
  context: Context,
  settle: (result: unknown) => unknown = same,
) => {
  const reads = tracked(read);
  const views = viewsOf(source, reads.read);
  const { row } = rule;
  let result: unknown;
  try {
    result = settle(
      row === undefined
        ? rule.formula(views.form(true), toolsWith({ peek: views.form(false) }, context))
        : rule.formula(views.row(row, true), toolsWith(rowTools(views, row), context)),
    );
  } catch (cause) {
    const label = `${rule.label}: formula failed`;
    throw (
      reads.failure() ??
      (cause instanceof SeparateCause ? new Error(label, { cause }) : wrapError(label, cause))
    );
  } finally {
    views.stop();
  }
  const failure = reads.failure();
  if (failure !== undefined) throw failure;
  return { result, reads: views.reads };
};

// Whether two runs read the same addresses in the same order, and whether they
// also read the same values.
export const sameAddresses = (a: Reads, b: Reads) => {
  if (a.size !== b.size) return false;
  const others = b.keys();
  for (const address of a.keys()) if (others.next().value !== address) return false;
  return true;
};
export const sameReads = (a: Reads, b: Reads) => {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  const others = b.entries();
  for (const [address, value] of a) {
    const [other, found] = others.next().value as [unknown, unknown];
    if (other !== address || !Object.is(found, value)) return false;
  }
  return true;
};

// Whether every recorded read still returns the value it returned then.
export const unchanged = (reads: Reads, read: Read) => {
  for (const [address, value] of reads) if (!Object.is(read(address), value)) return false;
  return true;
};
