// The texts of the validation an application declares once, in createForms:
// those of required, of min and max, and of a query a submission needed that
// failed. Each is a function of what the message names, never of the value,
// so that the rows that share a state share its message too. Without them,
// the texts are English defaults.
import { describe, isPlainRecord } from "./data.js";
import { wrapError } from "./fields.js";

type Labeled = { readonly label: string | undefined };
export type Messages = {
  readonly required: (about: Labeled) => string;
  readonly min: (
    about: Labeled & { readonly type: string; readonly min: number | string },
  ) => string;
  readonly max: (
    about: Labeled & { readonly type: string; readonly max: number | string },
  ) => string;
  readonly query: (about: Labeled) => string;
};
export type MessageKind = keyof Messages;

export const defaultMessages: Messages = Object.freeze({
  required: () => "Required",
  min: ({ min }) => `Minimum ${min}`,
  max: ({ max }) => `Maximum ${max}`,
  query: () => "Could not obtain required data",
});
const kinds = Object.keys(defaultMessages);

// The messages of createForms, checked once: an object whose properties are
// functions, each replacing its default.
export const checkMessages = (declared: unknown): Messages => {
  if (declared === undefined) return defaultMessages;
  if (!isPlainRecord(declared)) throw new Error("createForms: messages must be an object");
  const messages: Record<string, unknown> = { ...defaultMessages };
  for (const [key, value] of Object.entries(declared)) {
    if (!kinds.includes(key))
      throw new Error(`createForms messages: unknown property ${describe(key)}`);
    if (value === undefined) continue;
    if (typeof value !== "function")
      throw new Error(`createForms messages.${key} must be a function`);
    messages[key] = value;
  }
  return Object.freeze(messages) as Messages;
};

// A message of kind, which must be a non-empty string.
export const messageOf = <K extends MessageKind>(
  messages: Messages,
  kind: K,
  about: Parameters<Messages[K]>[0],
): string => {
  let text: unknown;
  try {
    text = (messages[kind] as (about: unknown) => unknown)(Object.freeze({ ...about }));
  } catch (cause) {
    throw wrapError(`Validation message ${kind}: formula failed`, cause);
  }
  if (typeof text !== "string" || text === "")
    throw new Error(
      `Validation message ${kind}: expected a non-empty string, got ${describe(text)}`,
    );
  return text;
};
