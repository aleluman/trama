// Messages about validation in the Errors and limits table, with their location and cause.
export const validationMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm",
    'Field "x": required must be a boolean or a non-empty message',
    "required in the definition is neither a boolean nor a non-empty string.",
  ],
  [
    "defineForm",
    'Rules of collection "lines": unknown property "rows"',
    "The rules for a collection accept each, row, and collection.",
  ],
  [
    "defineForm",
    'Row rules of "lines": unknown property "eror"',
    'row and collection accept error and warning. For a collection: Collection rules of "lines": ….',
  ],
  [
    "defineForm",
    'Form section "form": unknown property "errors"',
    "The form section accepts readOnly, error, and warning.",
  ],
  [
    "createForms",
    'createForms messages: unknown property "requird"',
    "messages accepts required, min, max, and query, each a function: createForms messages.required must be a function. If it is not an object: createForms: messages must be an object.",
  ],
  [
    "createSession, edit, reset",
    'Field "x" error: incompatible result true, expected a non-empty message, false or undefined',
    'A message is a non-empty string, false, or undefined. For a row: Row of "lines" row "r1" error: …. For a collection: Collection "lines" error: …. For the form: Form warning: ….',
  ],
  [
    "createSession, edit, reset",
    'Field "x" required: incompatible result null, expected a boolean, a non-empty message or undefined',
    "The required formula returned something else, including an empty string.",
  ],
  [
    "createSession, edit, add, reset",
    'Validation message min: expected a non-empty string, got ""',
    "A message function from createForms returned something other than a non-empty string. If it throws: Validation message required: formula failed: …, with the original cause. The operation is rejected.",
  ],
];
