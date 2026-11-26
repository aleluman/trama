// Messages in the Errors and limits table, with their location and cause.
export const messages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm",
    "Form configuration requires fields and optional collections/context/defaults/include/rules/form/outputs",
    "The configuration has keys other than fields, collections, context, defaults, include, rules, form, or outputs.",
  ],
  [
    "defineForm",
    "Form context must be declared with declareContext<T>()",
    "context is not what declareContext() returns, for example, a hand-written object.",
  ],
  [
    "defineForm",
    "Form defaults must be a function of the context",
    "defaults is not a function. Without context: Form defaults requires a context.",
  ],
  [
    "defineForm",
    'Field "x": readOnly must be a boolean or a non-empty reason',
    "The state declared on the field is invalid. Also: hidden must be a boolean.",
  ],
  ["defineForm", 'Field "x": unknown type …', "A field was not created with the field helpers."],
  [
    "defineForm",
    'Field "x" (select): duplicate option',
    "Two options have the same value. This also applies to multiSelect.",
  ],
  [
    "defineForm",
    "Form rules must be an object keyed by field",
    "rules is not an object keyed by field. For example, it is a function.",
  ],
  [
    "defineForm",
    'Rules: unknown field "x"',
    "rules names a field that does not exist, even if its entry is undefined.",
  ],
  [
    "defineForm",
    'Field "x" rules: unknown property "y"',
    "An entry has a property other than value, disabled, readOnly, hidden, required, label, placeholder, decimals, min, max, params, states, onChange, onEdit, query, or relation.",
  ],
  [
    "defineForm",
    'Field "x" value: formula must be a function',
    "value is not a function. With onChange or onEdit: event must be a function. With disabled, readOnly, hidden, and required: expected a formula or an array of formulas.",
  ],
  [
    "defineForm",
    'Field "x" placeholder: checkbox fields have no placeholder',
    'placeholder exists only on text, number, date, async, and multiAsync fields. Also, in the field definition: Field "x": checkbox fields have no placeholder, or if it is not a string, Field "x": placeholder must be text.',
  ],
  [
    "defineForm",
    'Field "x" params: text fields have no params',
    "params exists only on async and multiAsync fields.",
  ],
  [
    "defineForm",
    'Form section "form": unknown property "hidden"',
    'form accepts only readOnly. Also: Form readOnly[0]: unknown field "x" in except.',
  ],
  [
    "defineForm",
    'Field "0": names that JavaScript orders as indices are not allowed',
    "A field name such as “0” or “12” would change the declaration order of the rules.",
  ],
  [
    "defineForm",
    'Output "x": invalid or foreign reference',
    "outputs returns something that was not created by its output().",
  ],
  [
    "endpoint.options, endpoint.list, endpoint.value",
    "Endpoint: load must be a function",
    "The endpoint did not receive a function.",
  ],
  [
    "defineEndpoints",
    'Endpoint "x" must be created with endpoint.options, endpoint.list or endpoint.value',
    "A registry entry is not an endpoint. If the registry is not an object: Endpoints must be an object of endpoints.",
  ],
  [
    "createForms",
    "createForms requires endpoints: an array of registries",
    "endpoints is missing, is not an array, contains an element that did not come from defineEndpoints, or the configuration has another property.",
  ],
  [
    "createForms",
    'Endpoint "x" is declared in two registries',
    "Two registries in the tuple declare the same key.",
  ],
  ["field.async", 'Unknown endpoint "x"', "The key is not in the createForms registries."],
  [
    "field.async",
    'Endpoint "x" gives a value; use an options or list endpoint',
    'The key names a value endpoint, which can only be used by a query. For a hand-written async field: Field "x" (async): endpoint "y" gives a value; use an options or list endpoint.',
  ],
  [
    "defineForm",
    'Field "x" (async): define the form with the defineForm of createForms',
    'An async field was passed to defineForm from trama-forms/core. With defineForm from createForms and a key outside its registries: Field "x" (async): unknown endpoint "y".',
  ],
  [
    "defineForm",
    'Field "x" query: define the form with the defineForm of createForms',
    "An entry with query was passed to defineForm from trama-forms/core, regardless of its shape. query: undefined is equivalent to omitting it.",
  ],
  [
    "defineForm",
    'Field "x" query: expected an object with endpoint, params, patch and optional forPrepare',
    'query is not a plain object. The subsequent checks are in this order: unknown property "y", unknown endpoint "y", params must be a function, patch must be a function, and forPrepare must be a boolean.',
  ],
  [
    "defineForm",
    'Field "x" query: endpoint "y" is paged; use a value or list endpoint',
    "The query names a paged options endpoint.",
  ],
  [
    "createSession",
    "Form definition must be created with defineForm",
    "A copy or a hand-written object was passed in.",
  ],
  [
    "createSession",
    "Form with async fields requires a scope",
    "scope is missing. With queries and no async fields: Form with queries requires a scope. Also: Session scope must be a string or a finite number and Session loader must be a function.",
  ],
  [
    "createSession, useFormSession",
    "Form requires a context",
    "The form declares a context, and the session received none or received undefined.",
  ],
  [
    "createSession, useFormSession",
    "Form declares no context",
    "The session received a context that the form does not declare.",
  ],
  [
    "createSession, useFormSession",
    'Session context must be plain data: a Date at "today"',
    "A piece of context data is not plain. The path identifies it. If the context is not an object: Session context must be an object.",
  ],
  [
    "createSession",
    "Form defaults: formula failed: …",
    "defaults threw. The session is not created, and the original error is available in cause. If it does not return an object: Form defaults: expected an object of values, got 5.",
  ],
  [
    "createSession",
    'Form defaults: incompatible value 5 for text field "deliveryDate"',
    'defaults gives a value incompatible with the field, including undefined. For an unknown field: Form defaults: unknown field "x". For an option that is not plain data: incompatible value for async field "customer": option must be plain data: a Date at "since".',
  ],
  ["createSession, edit", 'Unknown field "x"', "initial or edit names an unknown field."],
  [
    "createSession, edit",
    'Field "x" (number): incompatible value …',
    "The value does not match the field type.",
  ],
  [
    "createSession, edit",
    'Field "x" (async): option must be plain data: a Date at "since"',
    "The option contains data that is not plain. The path identifies it. In a formula or an event, the same reason is included in its message. Without value and label: incompatible value ….",
  ],
  [
    "createSession, edit",
    'Field "x" value: formula failed: …',
    "A value formula threw. The operation is rejected, and the original error is available in cause.",
  ],
  [
    "createSession, edit",
    'Field "x" value: incompatible result …',
    "The formula returned a value incompatible with the field, such as NaN, null in a text field, an option from elsewhere, or a promise.",
  ],
  [
    "createSession, edit",
    'Field "a" value: cyclic dependency a → b → a',
    "The formulas read each other, or one reads its own field. If the cycle goes through an event, the path names it as country.onChange or country.onEdit.",
  ],
  [
    "edit",
    'Field "x" onChange: event failed: …',
    "An event threw. The edit is rejected, and the original error is available in cause. If the event is onEdit, the message uses that name.",
  ],
  [
    "edit",
    'Field "x" onChange: expected a patch object, got …',
    'The event returned neither an object nor undefined. The prefix names onChange or onEdit. Also: unknown field "y" in patch, incompatible value …, and toDefaults: unknown field.',
  ],
  [
    "createSession, edit, reset",
    'Field "x" readOnly[1]: formula failed: …',
    "A state formula threw. The index is the array index. The same applies to disabled, hidden, required, label, placeholder, decimals, min, max, and states.",
  ],
  [
    "createSession, edit, reset",
    'Field "x" hidden: incompatible result 5, expected a boolean or undefined',
    "A state formula returned something outside its domain, such as an empty reason in disabled or readOnly.",
  ],
  [
    "createSession, edit, reset",
    'Field "x" states: unknown property "value" for field "y"',
    "The state patch names an unknown field or property, a placeholder the field does not have, or an incompatible value.",
  ],
  [
    "createSession, edit, reset",
    'Field "x" params: incompatible result 5, expected a plain object or undefined',
    'params returned something else, or it threw: params: formula failed: …. Also: result must be plain data: …, undefined is not allowed inside arrays at "tags[0]", "__proto__" is not allowed as a key, and "constructor" is not allowed as a key. In a query, the label is Field "x" query.params.',
  ],
  [
    "createSession, edit, reset",
    "Form readOnly[0]: formula failed: …",
    "A form lock entry threw or returned something incompatible. Without an array, the label is Form readOnly.",
  ],
  [
    "edit, reset, retry",
    "Cannot edit a session during its notification",
    "An observer of the same session called edit, reset, or retry. The message names the operation: Cannot reset … or Cannot retry ….",
  ],
  ["retry", 'Field "x" has no query', "The entry has no query, or the field does not exist."],
  [
    "session.list",
    'Field "x" (text) has no option list',
    'The field is neither async nor multiAsync. If it does not exist: Unknown field "x". Calling list.search with something other than a string throws TypeError.',
  ],
  [
    "option list error",
    'Field "x" list: request failed: …',
    'The error is stored without being thrown. It remains in the list snapshot. The original, in cause, is the load or response error, such as Endpoint "x" page 1: expected { options, more }, option 3: expected value and label, or duplicate option value 17.',
  ],
  [
    "query error",
    'Field "x" query: request failed: …',
    'The error is stored without being thrown. It remains in snapshot.queries and nothing is written. The original, in cause, is the load, loader, or validation error, such as Endpoint "x": result must be plain data: a Date at "since".',
  ],
  [
    "query error",
    'Field "x" query: patch failed: …',
    'patch threw. Also: expected a patch object, got 5, unknown field "y" in patch, and incompatible value …. Nothing is written.',
  ],
  [
    "query error",
    'Field "x" query: response operation failed: …',
    "A formula, an event, or params failed when applying the response. Nothing is written, and the original error is available in cause.",
  ],
  [
    "reading a derived output",
    'Output "x": calculation failed: …',
    "The output formula or an output it reads threw.",
  ],
  [
    "derived output result",
    "Output results cannot contain functions",
    "Also: plain arrays or objects, with no cycles and only data properties.",
  ],
  [
    "createReactBinding",
    "text: invalid renderer",
    "The registered value is neither a component nor undefined, or the key is not a field type, even if its value is undefined.",
  ],
  [
    "createReactBinding",
    'Binding options: unknown property "x"',
    "The options accept only loader, forms, and showErrors. Also: Binding options must be an object and Binding loader must be a function.",
  ],
  ["queryLoader", "queryLoader requires a QueryClient", "No client with fetchQuery was passed."],
  [
    "Field, useFormSession",
    'Field "x" (text): missing renderer',
    "The registry does not cover a field type in the definition, including when its component is undefined.",
  ],
  [
    "useFormSession",
    "Changing definition requires a different session key",
    "The definition changed without a change to key.",
  ],
  [
    "useFormSession",
    "Changing scope requires a different session key",
    "scope changed without a change to key.",
  ],
  [
    "useFormSession",
    "Changing context requires a different session key",
    "Once the session was ready, the context data changed without a change to key. A different object with the same data does not count as a change.",
  ],
  [
    "useFormSession + TanStack Query",
    "Initial query has no data",
    "The query completed successfully but returned no data.",
  ],
  [
    "useFormSession + TanStack Query",
    "Initial query refresh could not be verified …",
    "The refetch was canceled or did not produce newer data. Use retry().",
  ],
];
