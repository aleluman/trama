export const relationMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm, defineRules",
    'Field "driver" relation: expected an object with default and members',
    "The relation declaration must be a plain object.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: unknown property "base"',
    "The relation accepts only default and members.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation members: expected an object of formulas keyed by field',
    "members must be a plain object with the formula for each member.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: expected two members, got 1',
    "The relation requires exactly two members.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation default: expected "rate" or "local"',
    "default must name one of the members.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: the driver cannot be one of its members',
    "The driver's name appears in members.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" of "lines" relation: member "local" is not a field',
    "The member does not exist in the same scope as the driver.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation members.local: formula must be a function',
    "The entry for local in members must be a function.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: number fields cannot drive a relation; use a text or a select',
    "The driver must be a text or select field.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: a member cannot name the empty text ""',
    "For a text driver, the empty string is reserved for the default member.",
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: member "local" is not an option of the select',
    'An option with the member\'s name is missing. When validating an included relation, the prefix is Field "driver" relation (include[0]).',
  ],
  [
    "defineForm, defineRules",
    'Field "driver" relation: option "none" of the select is not a member',
    "An option does not name any member.",
  ],
  [
    "defineForm",
    'Field "driver" relation: declared by include[0] and include[1]',
    "The driver has two relation declarations.",
  ],
  [
    "defineForm",
    'Field "amount" value in rules: the relation of "discountBy" in include[0] takes the value and the events of its members',
    "A member declares its own value, onChange, or onEdit. The message names the property and the location of each declaration. The same conflict is rejected within defineRules.",
  ],
  [
    "defineForm, defineRules",
    'Field "rate": member of the relation of "driver" in rules and of the relation of "other" in rules; a field is a member of one relation',
    "The field is a member of two relations. The message names the location of each one.",
  ],
  [
    "createSession, edit, patch, add, commit",
    'Field "rate" value (relation of "driver"): formula failed',
    'The text driver holds an unknown value. The message in cause is the driver "driver" holds "R", which is no member. For rows, the collection and key are added to the prefix.',
  ],
  [
    "patch",
    'Patch: incompatible value "typo" for select field "driver"',
    "The driver's value is not a select option. It is rejected when the patch is validated.",
  ],
];
