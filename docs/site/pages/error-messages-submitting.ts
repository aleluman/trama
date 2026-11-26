// Messages about prepare, commit, touch, and pending input in the Errors and limits table, with their location and cause.
export const submittingMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm",
    'Field "rate" query: forPrepare must be a boolean',
    "forPrepare, in an entry's query, is not true, false, or undefined.",
  ],
  [
    "prepare",
    "prepare: signal must be an AbortSignal",
    'The signal option is not an AbortSignal. For an unknown option: prepare: unknown option "sigal". If the options are not an object: prepare: options must be an object.',
  ],
  [
    "prepare",
    "Cannot prepare a session during its notification",
    "A session listener called prepare during notification.",
  ],
  [
    "commit",
    "Cannot commit a session during its notification",
    "A session listener called commit during notification.",
  ],
  [
    "commit",
    "commit: prepared belongs to another session",
    "The prepared submission comes from another session or is an object that prepare did not return.",
  ],
  [
    "commit",
    'commit: key "r9" of "lines" was not in prepared',
    'A canonical patch names a row that was not in the prepared submission, such as one added later. For an unknown field: commit: unknown field "nmber" in patch.',
  ],
  [
    "touch",
    'touch: field "absent" does not exist',
    'The name is not a header field, including when it names a collection. For a row: Collection "lines": touch: field "absent" does not exist.',
  ],
  [
    "input",
    'input: field "absent" does not exist',
    'The name is not a header field. For a row: Collection "lines": input: field "absent" does not exist.',
  ],
  [
    "input",
    'input of "since": message must be a non-empty string or undefined',
    "error() received an empty string or something other than a string.",
  ],
  [
    "input",
    'input of "since": the view was disposed',
    "The controller has already been disposed, through its own dispose, a reset, or removal of its row. Calling dispose() again does not throw.",
  ],
  [
    "input",
    "Cannot report input to a session during its notification",
    "A session listener called error or dispose during notification. With touch: Cannot touch a session during its notification.",
  ],
  [
    "createReactBinding",
    'createReactBinding: showErrors must be "touched" or "attempted"',
    "showErrors is not one of the two policies.",
  ],
];
