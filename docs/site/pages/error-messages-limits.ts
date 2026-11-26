// Messages about decimals and limits in the Errors and limits table, with their location and cause.
export const limitMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm",
    'Field "x" (number): decimals must be a non-negative integer',
    'decimals is not a non-negative integer, including null. For a limit outside its domain: Field "x" (number): min must be a finite number or Field "x" (date): max must be a civil date YYYY-MM-DD. The definition does not accept null as a limit.',
  ],
  [
    "defineForm",
    'Field "x": text fields have no min',
    'The type has no such property. decimals exists only on number, and min and max on number and date. In a rule: Field "note" min: text fields have no min.',
  ],
  [
    "defineForm",
    'Field "x" (number): min 20 exceeds max 10',
    'The definition gives a minimum greater than its maximum. For a date: min "2026-05-01" exceeds max "2026-04-01". For a row: Field "price" of "lines" (number): ….',
  ],
  [
    "defineForm",
    'Field "price" decimals: formula must be a function',
    "decimals, min, and max accept a single formula, like label. An array or a fixed value is rejected.",
  ],
  [
    "createSession, edit, reset",
    'Field "price" decimals: incompatible result -1, expected a non-negative integer or undefined',
    "The decimals formula returned something else, including null.",
  ],
  [
    "createSession, edit, reset",
    'Field "price" min: incompatible result Infinity, expected a finite number, null or undefined',
    'A limit formula returned something outside its domain. For a date: Field "to" min: incompatible result "2026-02-30", expected a civil date YYYY-MM-DD, null or undefined.',
  ],
  [
    "createSession, edit, reset",
    'Field "trigger" states: text field "note" has no min',
    'The state patch gives a limit to a field that has no such limit. With a value outside the domain: incompatible max Infinity for field "price", expected a finite number, null or undefined.',
  ],
  [
    "createSession, edit, add, reset",
    'Field "price" (number): min 20 exceeds max 10',
    'The combined result of the contributions has a minimum greater than its maximum. The entire operation is rejected, and the session retains its snapshot. For a row: Field "price" of "lines" row "r3" (number): min 10 exceeds max 5.',
  ],
];
