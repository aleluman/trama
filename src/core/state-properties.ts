// The state properties of a field and what each takes. A flag takes true, or
// a non-empty reason in disabled and readOnly, or a non-empty message in
// required, and false or undefined withdraw it; a text takes a string; a
// message, error or warning, takes a non-empty string, and false or undefined
// withdraw it. A limit takes a value of its domain, in the field types that
// have it: decimals, and the min and max of a number or of a date. In rules
// and states patches, null suppresses a min or a max that contributions before
// it gave; undefined withdraws, as in every property.
import { describe } from "./data.js";
import type { FieldDefinition } from "./field-definitions.js";
import { traitsOf, type Domain } from "./field-traits.js";

export const stateKinds = {
  disabled: "reason",
  readOnly: "reason",
  hidden: "flag",
  required: "required",
  label: "text",
  placeholder: "text",
  decimals: "limit",
  min: "limit",
  max: "limit",
  error: "message",
  warning: "message",
} as const;
export type StateProperty = keyof typeof stateKinds;
export type Limit = {
  [P in StateProperty]: (typeof stateKinds)[P] extends "limit" ? P : never;
}[StateProperty];
export const isStateProperty = (key: PropertyKey): key is StateProperty =>
  Object.hasOwn(stateKinds, key);
export const isLimit = (property: StateProperty): property is Limit =>
  stateKinds[property] === "limit";

// The domain of a limit in a field type, which the traits of the type give.
const domainOf = (type: FieldDefinition["type"] | undefined, property: Limit) =>
  type === undefined
    ? undefined
    : (traitsOf(type).limits as Partial<Record<Limit, Domain>> | undefined)?.[property];

// Whether a field type has a state property: the placeholder and the limits
// exist only in the field types that declare them.
export const hasState = (type: FieldDefinition["type"], property: StateProperty) =>
  property === "placeholder"
    ? traitsOf(type).placeholder
    : !isLimit(property) || domainOf(type, property) !== undefined;

// What a null limit contributes: it removes the limit from the state.
export const unlimited: unique symbol = Symbol("unlimited");
export type Contributed = true | string | number | typeof unlimited;
// The contribution a value of a state property makes to a field of type,
// undefined when it withdraws it, or null when the property does not take it.
export const contributionOf = (
  property: StateProperty,
  value: unknown,
  type: FieldDefinition["type"] | undefined,
): Contributed | undefined | null => {
  if (value === undefined) return undefined;
  if (isLimit(property)) {
    const domain = domainOf(type, property);
    if (value === null) return domain?.suppressible === true ? unlimited : null;
    return domain?.accepts(value) === true ? (value as number | string) : null;
  }
  const kind = stateKinds[property];
  if (kind === "text") return typeof value === "string" ? value : null;
  if (value === false) return undefined;
  if (value === true) return kind === "message" ? null : true;
  return kind !== "flag" && typeof value === "string" && value !== "" ? value : null;
};
const expected = {
  reason: "a boolean, a non-empty reason or undefined",
  required: "a boolean, a non-empty message or undefined",
  flag: "a boolean or undefined",
  text: "a string or undefined",
  message: "a non-empty message, false or undefined",
};
// What contributionOf takes, for a diagnostic.
export const expectedOf = (property: StateProperty, type: FieldDefinition["type"] | undefined) => {
  if (!isLimit(property)) return expected[stateKinds[property]];
  const domain = domainOf(type, property);
  return `${domain?.expected}${domain?.suppressible === true ? ", null" : ""} or undefined`;
};

// The state a definition declares: flags, and the limits of its type in their
// domain, without null, with min not above max. Messages come only from rules.
export const checkDeclaredState = (
  label: string,
  item: Record<string, unknown>,
  type: FieldDefinition["type"],
) => {
  for (const [key, kind] of Object.entries(stateKinds)) {
    const value = item[key];
    if (kind === "text" || kind === "message" || value === undefined) continue;
    if (kind !== "limit") {
      if (contributionOf(key as StateProperty, value, type) === null)
        throw new Error(`${label}: ${key} must be a boolean${alternatives[kind]}`);
      continue;
    }
    const domain = domainOf(type, key as Limit);
    if (domain === undefined) throw new Error(`${label}: ${type} fields have no ${key}`);
    if (!domain.accepts(value))
      throw new Error(`${label} (${type}): ${key} must be ${domain.expected}`);
  }
  checkLimits(label, type, item);
};
const alternatives = {
  reason: " or a non-empty reason",
  required: " or a non-empty message",
  flag: "",
};

// Rejects a min above the max: of a definition, or of a state that combines
// the contributions to a field. The limits of one field share their domain.
export const checkLimits = (
  label: string,
  type: string,
  { min, max }: { readonly min?: unknown; readonly max?: unknown },
) => {
  if (min !== undefined && max !== undefined && (min as number) > (max as number))
    throw new Error(`${label} (${type}): min ${describe(min)} exceeds max ${describe(max)}`);
};
