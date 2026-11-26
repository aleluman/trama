// Messages about rule sets in the Errors and limits table, with their location and cause.
export const ruleSetMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineRules",
    "Rule set configuration requires rules and optional fields/collections/context",
    "The configuration is not an object or has keys other than fields, collections, context, or rules.",
  ],
  [
    "defineRules",
    "Rule set rules must be an object keyed by field",
    "rules is missing or is not an object keyed by field. Also: Rule set fields must be an object and Rule set collections must be an object keyed by collection.",
  ],
  [
    "defineRules",
    'Rule set rules: unknown field "x"',
    'rules names a field the rule set does not declare. For rows: Rule set rules of collection "lines" each: unknown field "x".',
  ],
  [
    "defineRules",
    'Field "product" (async): define the rule set with the defineRules of createForms',
    "An async field or query was used with defineRules from trama-forms/core.",
  ],
  [
    "defineRules",
    "Rule set context must be declared with declareContext<T>()",
    "context is not what declareContext() returns.",
  ],
  ["defineForm", "Form include must be an array of rule sets", "include is not an array."],
  [
    "defineForm",
    "Form include[1]: expected a rule set, false, null or undefined",
    "An element does not come from defineRules, such as a copy, 0, or an empty string.",
  ],
  [
    "defineForm",
    "Form include[2]: repeats the rule set of include[0]",
    "The same rule set appears twice in include.",
  ],
  [
    "defineForm",
    "Form include[0]: rule set of another createForms",
    "The rule set comes from another createForms. With defineForm from trama-forms/core: rule set of createForms: define the form with the defineForm of createForms.",
  ],
  [
    "defineForm",
    'Form include[0]: rule set requires field "rate" of type number, not text',
    'The form lacks a field, collection, or context required by the rule set, or has one of a different type. Also: … collection "lines", … field "lot" of "lines" with endpoint "lots", not "products", and … requires a context.',
  ],
  [
    "defineForm",
    'Field "amount" of "lines" value: declared by include[1] and include[2]',
    "A field's value, onChange, onEdit, params, or query appears in two rule sets, or in one rule set and in rules: … declared by include[0] and rules.",
  ],
  [
    "defineForm, defineRules",
    'Field "x": onChange in rules and onEdit in rules; a field declares onChange or onEdit, not both',
    "The field declares both events. The message names where each one was declared, including when they come from different rule sets.",
  ],
];
