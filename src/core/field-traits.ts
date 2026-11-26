import { copiedArray, copyData, dataProblem, isKey, isOption, isRecord } from "./data.js";
import type {
  AsyncDefinition,
  FieldDefinition,
  FieldValue,
  RemoteDefinition,
  WithPlaceholder,
} from "./field-definitions.js";
import type { Limit } from "./state-properties.js";
import {
  adoptOptions,
  adoptValues,
  optionsProblem,
  sameSet,
  valuesProblem,
  withDomain,
} from "./multiple.js";

// What each field type decides. Whether it has a placeholder, its limits, and
// whether an endpoint gives its options, must agree with its definition type. problem
// tells why a value is rejected, when the type knows more than that it is
// incompatible; without accepts, a value is accepted when problem finds
// nothing. adopt gives the value a write stores, given the values the field
// holds now. missing tells an empty value, which required rejects, null when
// absent; equal compares two values for dirty, Object.is when absent.
type FieldTypeTraits<D extends FieldDefinition> = {
  readonly empty: FieldValue<D>;
  missing?(value: FieldValue<D>): boolean;
  equal?(a: FieldValue<D>, b: FieldValue<D>): boolean;
  accepts?(item: D, value: unknown): boolean;
  problem?(item: D, value: unknown): string | undefined;
  adopt?(value: FieldValue<D>, held: readonly unknown[]): FieldValue<D>;
  check?(label: string, item: Record<string, unknown>): void;
  copy?(item: D): D;
  readonly placeholder: D extends WithPlaceholder ? true : false;
  readonly limits?: { readonly [P in Limit & keyof D]-?: Domain };
  readonly remote: D extends RemoteDefinition ? true : false;
};
// The domain of a limit: what it takes, and whether null, in rules and states
// patches, suppresses it.
export type Domain = {
  readonly accepts: (value: unknown) => boolean;
  readonly expected: string;
  readonly suppressible: boolean;
};

// The options of a select or a multiple select: an array of options with a
// text label and a key value, without repeated values.
const checkOptions = (label: string, { type, options }: Record<string, unknown>) => {
  if (!Array.isArray(options))
    throw new Error(`${label} (${String(type)}): options must be an array`);
  const seen = new Set<unknown>();
  for (const option of options as unknown[]) {
    if (!isRecord(option) || typeof option.label !== "string" || !isKey(option.value))
      throw new Error(`${label} (${String(type)}): invalid option`);
    if (seen.has(option.value)) throw new Error(`${label} (${String(type)}): duplicate option`);
    seen.add(option.value);
  }
};
// A native array, so that the copy keeps no method of the author's container,
// which a later check of the definition would run again.
const freezeOptions = <D extends { readonly options: readonly object[] }>(item: D): D => ({
  ...item,
  options: Object.freeze(Array.from(item.options, (option) => Object.freeze({ ...option }))),
});
// A copy of a definition whose default, given, is a frozen copy of its data.
const copyDefault =
  (subject: string) =>
  <D extends { readonly default?: unknown }>(item: D): D =>
    item.default === undefined || item.default === null
      ? { ...item }
      : { ...item, default: copyData(item.default, subject) };
const checkEndpoint = (label: string, item: Record<string, unknown>) => {
  if (typeof item.endpoint !== "string" || item.endpoint === "")
    throw new Error(`${label} (${String(item.type)}): endpoint must be a key`);
};

// A civil date: YYYY-MM-DD of the Gregorian calendar, with a year from 0001 to
// 9999 and a day of its month, read from its characters and never normalized.
const civilDate = /^(\d{4})-(\d{2})-(\d{2})$/u;
const isCivilDate = (value: unknown) => {
  const parts = typeof value === "string" ? civilDate.exec(value) : null;
  if (parts === null) return false;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days;
};
const count: Domain = {
  accepts: (value) => Number.isInteger(value) && (value as number) >= 0,
  expected: "a non-negative integer",
  suppressible: false,
};
const finite: Domain = {
  accepts: Number.isFinite,
  expected: "a finite number",
  suppressible: true,
};
const civil: Domain = {
  accepts: isCivilDate,
  expected: "a civil date YYYY-MM-DD",
  suppressible: true,
};

const fieldTypes = {
  text: {
    empty: "",
    missing: (value) => value === "",
    accepts: (_, value) => typeof value === "string",
    placeholder: true,
    remote: false,
  },
  number: {
    empty: null,
    accepts: (_, value) => value === null || Number.isFinite(value),
    placeholder: true,
    limits: { decimals: count, min: finite, max: finite },
    remote: false,
  },
  checkbox: {
    empty: false,
    missing: (value) => value === false,
    accepts: (_, value) => typeof value === "boolean",
    placeholder: false,
    remote: false,
  },
  date: {
    empty: null,
    accepts: (_, value) => value === null || isCivilDate(value),
    problem: () => "expected a civil date YYYY-MM-DD between 0001 and 9999",
    placeholder: true,
    limits: { min: civil, max: civil },
    remote: false,
  },
  select: {
    empty: null,
    accepts: (item, value) =>
      value === null || item.options.some((option) => option.value === value),
    check: checkOptions,
    copy: freezeOptions,
    placeholder: false,
    remote: false,
  },
  multiSelect: {
    empty: copiedArray([]),
    missing: (value) => value.length === 0,
    equal: (a, b) => sameSet(a, b, (member) => member),
    problem: valuesProblem,
    adopt: adoptValues,
    check: checkOptions,
    copy: (item) => withDomain(freezeOptions(copyDefault("selection")(item))),
    placeholder: false,
    remote: false,
  },
  // The option is the value: its value identifies it, so writing an option
  // with the value held keeps the held one, and anything else is written as a
  // frozen copy.
  async: {
    empty: null,
    equal: (a, b) => a === b || (a !== null && b !== null && a.value === b.value),
    accepts: (_, value) =>
      value === null || (isOption(value) && dataProblem(value, "option") === undefined),
    problem: (_, value) => (isOption(value) ? dataProblem(value, "option") : undefined),
    adopt: (value, held) =>
      value === null
        ? null
        : ((held.find((option) => isOption(option) && option.value === value.value) ??
            copyData(value, "option")) as FieldValue<AsyncDefinition>),
    check: checkEndpoint,
    copy: copyDefault("option"),
    placeholder: true,
    remote: true,
  },
  // Some options, each kept as an async field keeps its one.
  multiAsync: {
    empty: copiedArray([]),
    missing: (value) => value.length === 0,
    equal: (a, b) => sameSet(a, b, (option) => option.value),
    problem: (_, value) => optionsProblem(value),
    adopt: adoptOptions,
    check: checkEndpoint,
    copy: copyDefault("selection"),
    placeholder: true,
    remote: true,
  },
} satisfies {
  readonly [T in FieldDefinition["type"]]: FieldTypeTraits<Extract<FieldDefinition, { type: T }>>;
};
export const isFieldType = (type: unknown): type is FieldDefinition["type"] =>
  typeof type === "string" && Object.hasOwn(fieldTypes, type);
export const fieldTypeNames = Object.keys(fieldTypes) as FieldDefinition["type"][];
// TypeScript does not relate the key to the definition, so the lookup casts once.
export const traitsOf = (type: FieldDefinition["type"]) =>
  fieldTypes[type] as FieldTypeTraits<FieldDefinition>;

// Whether a value is empty for required, and whether two values are the same
// for dirty: by value in a remote field, by members in a multiple one. A row
// the baseline lacks has no value to compare with.
export const missingIn = (type: FieldDefinition["type"], value: unknown) =>
  traitsOf(type).missing?.(value as never) ?? value === null;
export const equalIn = (type: FieldDefinition["type"], a: unknown, b: unknown) =>
  Object.is(a, b) ||
  (a !== undefined && b !== undefined && (traitsOf(type).equal?.(a as never, b as never) ?? false));

// Whether an endpoint gives the options of a field: an async field, or a
// multiple one. Both have params, lists by view and queries that write them.
export const remote = (item: FieldDefinition): item is RemoteDefinition =>
  traitsOf(item.type).remote;
