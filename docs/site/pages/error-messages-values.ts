// Messages about dates and multi-selects in the Errors and limits table, with their location and cause.
export const valueMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm, createSession, edit",
    'Field "x" (date): expected a civil date YYYY-MM-DD between 0001 and 9999',
    'The date is not a YYYY-MM-DD string or does not exist in the calendar. Examples include 2026-02-30, 2026-2-1, a date with a time, or a Date. In a formula: Field "x" value: incompatible result for date field: …. In an event or a patch: incompatible value for date field "y": ….',
  ],
  [
    "defineForm, createSession, edit",
    'Field "x" (multiSelect): value "other" is not an option',
    'A value in the selection is not among its options, even if only the type differs: "3" is not 3.',
  ],
  [
    "defineForm, createSession, edit",
    'Field "x" (multiSelect): duplicate value "sale"',
    "The selection repeats a value.",
  ],
  [
    "defineForm, createSession, edit",
    'Field "x" (multiSelect): expected an array without holes',
    'The value of a multiSelect or multiAsync is not a plain array: a single value, null, an array with holes, or an array-like object. With extra properties: selection must be plain data: an array property at "note".',
  ],
  [
    "defineForm, createSession, edit",
    'Field "x" (multiAsync): option 0: expected value and label',
    'An element of the selection is not an option. The number is its position. With data that is not plain: option 0: option must be plain data: a Date at "since".',
  ],
  [
    "defineForm, createSession, edit",
    'Field "x" (multiAsync): duplicate option value 1',
    "Two options in the selection have the same value.",
  ],
];
