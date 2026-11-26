# Per-field presentation: subtypes, new values, and limits

## Context

A text field can be shown as a text area, a checkbox as a switch, and a remote select as a lookup with a table. Presentation can change with the chosen control, while the form retains the rules of its base type. Report filters can also use civil dates and selections of multiple options. Rules may need to change decimals and limits based on other fields.

Storing the date in its display format makes comparing values between views difficult. Comparing a selection as an ordered list treats an equivalent selection as a change. Mixing visual options with the base configuration ties rules to details specific to the renderer.

## Decision

- **Subtypes in the application's registry.**
  - `createForms({ endpoints, subtypes })` declares each subtype with `subtype.<base><Presentation>()`, and `field.<subtype>` creates its fields.
  - A subtype retains the value, rules, state properties, and requirements of its base type. Its definition stores the base in `type` and its name in `subtype`.
  - The core provides the mechanism without built-in domain subtypes. Each application declares its own.
  - A subtype field is accepted only in the forms, rule sets, and bindings of its `createForms`. At runtime it is recognized by identity.
- **Static, nested presentation.**
  - A subtype's own data goes in `presentation`. It is plain data, copied and frozen at definition time, that only its renderer reads. It stays fixed at runtime.
  - `OptionKey` marks a piece of data, in the type system only, that must be a key of the endpoint's option, such as the columns of a lookup with a table.
- **Renderers per subtype.** A subtype field requires a renderer under that subtype's key. To reuse the base renderer, register it explicitly under the subtype's key.
- **Decimals and limits as state properties.**
  - A number has `decimals`, `min`, and `max`, and a date has `min` and `max`. They are declared in the definition, in a formula by property, or in `states` patches, and are combined like other contributions ([ADR 0002](0002-property-based-rule-authoring.md)).
  - `undefined` withdraws a contribution, and `null` removes the limit from earlier contributions. State publishes the properties sparsely and never publishes `null`.
  - A combined result with `min > max` rejects the whole operation.
  - The core does not round, clamp, or normalize the value.
- **Civil date as its own type.** It is `string | null`, written as `YYYY-MM-DD`, with no time or time zone.
- **Multi-select value, static and remote.**
  - `multiSelect` stores the values of its options.
  - `multiAsync` stores the complete options and uses the lists, parameters, and queries of remote fields. [ADR 0003](0003-endpoint-registry.md) · [ADR 0004](0004-async-lists-and-queries.md)
  - The empty value is `[]`, and equality is based on set membership. Writing the same elements in a different order leaves the field unchanged.

## Options considered

- **A separate subtype registry (`defineSubtypes`).** It is an extra public value with no need for it. When subtypes are declared inline in `createForms`, a duplicate name is a type error.
- **Flat options on the field,** as in `field.textarea({ rows: 4 })`. They are easier to write, but they reserve the names of base keys, and any future base key, such as a validation `maxLength`, would break an application that used it as an option. Nesting them costs the same in the type system.
- **A channel for props separate from state.** It would duplicate the precedence and contributions that state properties already have.
- **IDs with hydration** in remote multi-select. The session would need a channel to request labels for standalone IDs. The application constructs the options at opening, as with an async field.
- **Date as a text subtype.** Text has a different empty value, and its values can be strings that do not represent dates. Date limits need comparable calendar values.
- **Domain subtypes in the core,** such as a tax identifier. Format and representation depend on the application. A core primitive is justified when it avoids coordination that applications would have to repeat.
- **Infer the full type of `forms` in the binding.** It cost about 5,000 more instantiations than reading only its field factories.

## Consequences

- Subtypes share a namespace with base types. A future base type with the same name as an application's subtype is a major change.
- TypeScript verifies the declared shape of `presentation` and that values marked with `OptionKey` are keys of the option. At runtime, `presentation` is checked for plain data.
- Acceptance by identity does not survive serialization. A reconstructed definition is rejected. The type system cannot distinguish two registries of identical shape.
- Writing many new options that do not come from a list all at once costs more than an edit. It is an opening or response case and is measured against that case's budget.

### Date and multi-select values

- **Set equality is handled when the type adopts the value, outside the engine.** Writing the same members in a different order returns the array the field already holds, and the engine sees no change. A value Trama has already copied is recognized unambiguously, so an attempt that runs again writes the same copy.
- **A remote field is a trait of the type table.** A predicate reads it at runtime, and `RemoteDefinition` names it in the type system, replacing a comparison with `"async"`. The binding marks which renderers receive a list in a table checked against their props.
- **Membership for a static multi-select** is stored only for the copy of the definition that Trama makes, with its options frozen. The default in the author's definition is checked before copying it, and that object, even if frozen, can change its options between two definitions.
- **A selection is checked in full before reading its members,** so an index with a getter is rejected without running the author's code.

### Decimals and limits

- **Limit domains are a trait of each field type,** alongside the placeholder. They specify which limits it has, which values each accepts, and whether `null` removes it. The definition, rules, and patches consult them in the same way.
- **Consistency applies to the combined result.** A new state with `min` greater than `max` rejects the operation, and states are combined before applying the memory delta, using a view of the contributions left by that delta. A rejection leaves no contributions for a later operation to reveal.
- **In the type system, `decimals`, `min`, and `max` are direct members of rule entries and patches.** Their type is checked where they are written, with a dedicated message in place of a conditional per field.

### Subtypes

- **The identity of a `createForms` is its endpoint table,** the same one the rule sets already compared, with no separate registry. Each factory marks its field with a symbol key whose value is an opaque token. Only the core knows which subtype of which table it corresponds to, so the mark survives spreads and copies of the definition without being forgeable through reflection. A subtype uses its base factory, so the two cannot diverge.
- **Presentation is copied when the field is created and again when the form is defined.** Copying a copy preserves it, so the second copy only has a cost if a spread changed it, and the renderer receives it with the same identity on every render.
- **The binding checks acceptance through `forms.defineRules`,** using only the subtype fields of each template and doing so once per template, because it cannot read the core's private mark. It finds the subtypes of `forms` in its `field` factories and infers its type only from `forms.field`. Inferring the full signature cost about 5,000 instantiations.
- **In the type system, the core checks a subtype field separately for rejection,** because it fits its base type. It rejects the field if it fits no accepted subtype, with a guard that skips traversing fields when none has a subtype, and checks every member of a union of sections. The internal `defineForm` constraint on accepted types was removed because checking it against generic acceptance cost 3,336 instantiations. This implementation measured 1,754,107 instantiations, 1.74% above its baseline.

### Limits that validate

`min` and `max` validate non-empty values with inclusive limits and preserve the original value. `decimals` remains a state property for the renderer. [ADR 0008](0008-validation-dirty-and-submission.md)

## Status

Decision accepted on October 22, 2026. [Per-field presentation](../technical.html#capability-presentation)
