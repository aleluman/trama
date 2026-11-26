// The section form of a definition: its lock, readOnly, which lock.ts
// compiles, and the declarations of the messages of the form, error and
// warning, which compile as those of rows and collections, to formulas of
// state of no field. They observe after the rules, as the lock.
import { isPlainRecord } from "./data.js";
import { messagesOf } from "./declarations.js";

const form = { kind: "form", collection: undefined } as const;

export const formSection = (section: unknown) => {
  if (section === undefined) return { readOnly: undefined, own: [] };
  if (!isPlainRecord(section))
    throw new Error('Form section "form" must be an object of properties');
  for (const key of Object.keys(section))
    if (key !== "readOnly" && key !== "error" && key !== "warning")
      throw new Error(`Form section "form": unknown property "${key}"`);
  const { readOnly, ...messages } = section;
  return { readOnly, own: messagesOf("Form", 'Form section "form"', form, messages) };
};
