// Messages from setErrors and setWarnings in the Errors and limits table, with their location and cause.
// setWarnings uses the same messages with its own name.
export const externalMessages: readonly (readonly [string, string, string])[] = [
  [
    "setErrors",
    "setErrors: source must be a non-empty string",
    "The source is not a string or is empty. If there is no list: setErrors: issues must be an array.",
  ],
  [
    "setErrors",
    'setErrors: issue has unknown property "path"',
    "An issue has a property other than message, field, collection, or key. If it is not an object: setErrors: each issue must be an object. If there is no text: setErrors: issue message must be a non-empty string.",
  ],
  [
    "setErrors",
    'setErrors: field "untill" does not exist',
    'The name is not a header field, including when it names a collection. For a row: setErrors: field "amont" of "lines" does not exist. For a collection: setErrors: collection "lined" does not exist.',
  ],
  [
    "setErrors",
    'setErrors: a field of "lines" needs its row key',
    "An issue names a field in a collection without its row key. For a key without a collection: setErrors: a row key needs its collection.",
  ],
  [
    "setErrors",
    'setErrors: key of "lines" belongs to no row of this session',
    "The key does not belong to any row this session has had in that collection. It belongs to another collection or session, or was made up. The key of a row that has been removed is skipped without an error.",
  ],
  [
    "setErrors",
    "setErrors: prepared belongs to another session",
    'from is a prepared submission from another session or an object that prepare did not return. For an unknown option: setErrors: unknown option "form". If the options are not an object: setErrors: options must be an object.',
  ],
  [
    "setErrors",
    "Cannot set errors of a session during its notification",
    "A session listener called setErrors during notification. With setWarnings: Cannot set warnings of a session during its notification.",
  ],
];
