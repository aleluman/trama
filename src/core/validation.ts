// The validation every field has: required rejects an empty value, and min
// and max, inclusive, a value that is not empty. Its result is a number, so
// that a state with the same result is shared: 0 when valid, or which check
// failed. At most one fails, since an empty value is not compared and min
// never exceeds max.
import type { FieldDefinition } from "./field-definitions.js";
import { missingIn } from "./field-traits.js";
import { messageOf, type Messages } from "./messages.js";
import type { StateProperty } from "./state-properties.js";
import { requiredMessageOf, type States } from "./states.js";

export const valid = 0;
const missing = 1;
const belowMin = 2;
const aboveMax = 3;

// What validation reads of a state, with the message of required.
type Checks = States[string];

export const validationOf = (type: FieldDefinition["type"], value: unknown, state: Checks) => {
  if (!state.required && state.min === undefined && state.max === undefined) return valid;
  if (missingIn(type, value)) return state.required ? missing : valid;
  if (state.min !== undefined && (value as number) < (state.min as number)) return belowMin;
  if (state.max !== undefined && (value as number) > (state.max as number)) return aboveMax;
  return valid;
};

// The properties that decide whether a field has a message: those its
// validation checks and the messages of its rules. The others, the label among
// them, change neither whether a field validates nor what a scope counts.
export const checked = (property: StateProperty) =>
  property === "required" ||
  property === "min" ||
  property === "max" ||
  property === "error" ||
  property === "warning";

// Whether two states validate a value alike.
export const sameChecks = (a: Checks, b: Checks) =>
  a === b ||
  (a.required === b.required &&
    a.min === b.min &&
    a.max === b.max &&
    (!a.required || requiredMessageOf(a) === requiredMessageOf(b)));

// The message of a failed check: that of required, or the one of the
// application for its kind.
export const validationMessage = (
  messages: Messages,
  type: FieldDefinition["type"],
  result: number,
  state: Checks,
) => {
  const { label, min, max } = state;
  if (result === missing)
    return requiredMessageOf(state) ?? messageOf(messages, "required", { label });
  if (result === belowMin)
    return messageOf(messages, "min", { type, min: min as number | string, label });
  return messageOf(messages, "max", { type, max: max as number | string, label });
};
