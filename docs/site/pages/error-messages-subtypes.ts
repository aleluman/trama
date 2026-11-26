// Messages about subtypes in the Errors and limits table, with their location and cause.
export const subtypeMessages: readonly (readonly [string, string, string])[] = [
  [
    "createForms",
    'Subtype "date" has the name of a field type',
    'A subtype has the name of a base type. Also: Subtype "1": names that JavaScript orders as indices are not allowed, Subtype "notes" must be created with subtype.<type>(), and createForms: subtypes must be an object of subtypes.',
  ],
  [
    "field.<subtype>",
    'Subtype "textarea": presentation must be plain data: a function at "rows"',
    'The presentation is not a plain data object: Subtype "textarea": presentation must be an object. A remote factory checks its endpoint first, like field.async.',
  ],
  [
    "defineForm, defineRules",
    'Field "notes" (subtype "textarea") belongs to other forms',
    'The factory of another createForms created the field, or the field lost its marker when serialized. For a row: Field "notes" of "lines" (subtype "textarea") belongs to other forms.',
  ],
  [
    "defineForm, defineRules",
    'Field "notes" (subtype "textarea"): define the form with the defineForm of createForms',
    "The core defineForm does not accept subtypes. Its defineRules says define the rule set with the defineRules of createForms.",
  ],
  [
    "defineForm, defineRules",
    'Field "notes": presentation requires a subtype',
    "A base-type field does not have presentation.",
  ],
  [
    "createReactBinding",
    '"textareas" is neither a field type nor a subtype of forms',
    "With forms, a registry key is neither a base type nor a subtype. Without forms: textareas: invalid renderer. For forms that did not come from createForms: Binding forms must be returned by createForms.",
  ],
  [
    "Field, useFormSession",
    'Field "notes" (subtype "textarea"): missing renderer',
    "The subtype has no component, even if its base type has one. The fallback is registered under the subtype key.",
  ],
  [
    "Field, useFormSession",
    'Field "notes" (subtype "textarea"): pass its forms to createReactBinding',
    "A binding without forms does not render subtypes. With other forms: belongs to other forms.",
  ],
];
