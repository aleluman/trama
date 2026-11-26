import { arrayIndex, copyData, isPlainRecord, isRecord } from "./data.js";
import type { FieldDefinition, FieldValue, WithPlaceholder } from "./field-definitions.js";
import { isFieldType, traitsOf } from "./field-traits.js";
import { checkDeclaredState } from "./state-properties.js";
export { isPlainRecord, isRecord } from "./data.js";
export {
  field,
  type AsyncConfig,
  type AsyncDefinition,
  type CheckboxDefinition,
  type CoreDefinition,
  type DateDefinition,
  type FieldDefinition,
  type FieldValue,
  type MultiAsyncConfig,
  type MultiAsyncDefinition,
  type MultiSelectDefinition,
  type NumberDefinition,
  type OptionOf,
  type ParamsOf,
  type RemoteDefinition,
  type SelectDefinition,
  type SelectOption,
  type TextDefinition,
  type WithPlaceholder,
} from "./field-definitions.js";
export { remote } from "./field-traits.js";

const defaultValue = (item: FieldDefinition) =>
  item.default === undefined ? traitsOf(item.type).empty : item.default;
// The value each field takes when nothing gives it one.
export const defaultsOf = (fields: Readonly<Record<string, FieldDefinition>>) =>
  Object.freeze(
    Object.fromEntries(Object.entries(fields).map(([name, item]) => [name, defaultValue(item)])),
  );

export const hasOnlyKeys = (
  value: unknown,
  allowed: readonly string[],
): value is Record<string, unknown> =>
  isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));

export const fieldAt = (fields: Readonly<Record<string, FieldDefinition>>, name: PropertyKey) =>
  Object.hasOwn(fields, name) ? fields[name as string] : undefined;

export const hasPlaceholder = <T extends FieldDefinition>(
  item: T,
): item is Extract<T, WithPlaceholder> => traitsOf(item.type).placeholder;

// JavaScript lists array indices before other keys, which would change the
// declaration order that decides precedence: fields, collections and subtypes
// cannot take such names.
export const checkOrder = (at: string, name: string) => {
  if (arrayIndex(name) !== undefined)
    throw new Error(`${at}: names that JavaScript orders as indices are not allowed`);
};

export const wrapError = (message: string, cause: unknown) =>
  new Error(`${message}${cause instanceof Error ? `: ${cause.message}` : ""}`, { cause });
// A cause that the failure of a formula keeps apart instead of repeating its
// message after its label, such as the driver of a relation that names no
// member. Any other wrapping repeats it, as it does with every cause.
export class SeparateCause extends Error {}

// Checks a field and returns the frozen copy that its definition owns. The
// author's object is read once and the copy is checked as it is kept, so a
// getter cannot pass with one value and keep another, and later changes to
// the object do not reach it. A field of a collection is labeled with its
// collection.
export const checkField = (
  name: string,
  declared: unknown,
  label = `Field "${name}"`,
): FieldDefinition => {
  checkOrder(label, name);
  if (!isRecord(declared)) throw new Error(`${label} must be a field definition`);
  const item: Record<string, unknown> = { ...declared };
  if (!isFieldType(item.type)) throw new Error(`${label}: unknown type ${String(item.type)}`);
  const traits = traitsOf(item.type);
  if (item.label !== undefined && typeof item.label !== "string")
    throw new Error(`${label}: label must be text`);
  if (item.placeholder !== undefined) {
    if (!traits.placeholder) throw new Error(`${label}: ${item.type} fields have no placeholder`);
    if (typeof item.placeholder !== "string") throw new Error(`${label}: placeholder must be text`);
  }
  if (item.presentation !== undefined) {
    if (item.subtype === undefined) throw new Error(`${label}: presentation requires a subtype`);
    item.presentation = presentationOf(item.presentation, `${label}: presentation`);
  }
  checkDeclaredState(label, item, item.type);
  traits.check?.(label, item);
  if (item.default !== undefined)
    validateValue(name, item as unknown as FieldDefinition, item.default, label);
  return copyField(item as unknown as FieldDefinition);
};
// The copies keep the mark of a subtype, a symbol key, as every spread does.
const copyField = (item: FieldDefinition) =>
  Object.freeze(traitsOf(item.type).copy?.(item) ?? { ...item });
// The presentation of a subtype is an object of plain data, frozen in depth
// once: copying a copy keeps it.
export const presentationOf = (value: unknown, at: string) => {
  if (!isPlainRecord(value)) throw new Error(`${at} must be an object`);
  return copyData(value, at);
};
export const accepts = (item: FieldDefinition, value: unknown) => {
  const traits = traitsOf(item.type);
  return traits.accepts === undefined
    ? traits.problem?.(item, value) === undefined
    : traits.accepts(item, value);
};
// Why accepts rejects a value, when its field type can tell more than that it
// is incompatible.
export const problemOf = (item: FieldDefinition, value: unknown) =>
  traitsOf(item.type).problem?.(item, value);
// The value a write stores. held are the values the field holds: the one it
// had when the operation started, and the one in its draft, if any.
export const adopt = (item: FieldDefinition, value: unknown, held: readonly unknown[]) => {
  const traits = traitsOf(item.type);
  return traits.adopt === undefined
    ? value
    : traits.adopt(value as FieldValue<FieldDefinition>, held);
};
export const validateValue = (
  name: string,
  item: FieldDefinition | undefined,
  value: unknown,
  label?: string,
): void => {
  if (item === undefined) throw new Error(`Unknown field "${name}"`);
  if (!accepts(item, value))
    throw new Error(
      `${label ?? `Field "${name}"`} (${item.type}): ${problemOf(item, value) ?? `incompatible value ${String(value)}`}`,
    );
};
