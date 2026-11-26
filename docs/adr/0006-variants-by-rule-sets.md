# Variants by composing rule sets

## Context

An order and a quote can share rules for quantities, prices, and totals and apply different approval rules. If one fragment declares `total.value` and another declares `total.disabled`, combining the two with spreads over `rules` causes the last one to replace the entire `total` entry. The author must merge or copy the rules to keep them.

A conditional spread such as `...(enabled && { … })` inside `rules` also breaks inference of the form's fields and context.

## Decision

- **Rule sets with requirements.**
  - `defineRules({ fields, collections, context, rules })` defines rules separately and declares the fields, collections, and context it needs from the form.
  - The rules are written and validated once, and the rule set works for any form that meets its requirements.
  - `createForms` returns a `defineRules` bound to its endpoint registry.
- **Composition without removing rules.**
  - A variant chooses which sets to include with `include` and never removes or replaces a rule by its path.
  - An element can be conditional (`enabled && extra`, `quote ? a : b`), and the composition is fixed when the form is defined.
  - The rules handle what varies by session by reading the context.
- **Order is a sequence of declarations.**
  - Rule sets come first, in `include` order, followed by the form's inline rules, with a single counter.
  - The precedence in [ADR 0002](0002-property-based-rule-authoring.md), "last declared writer wins," applies to that sequence.
- **Collisions by property.**
  - State properties accumulate as contributions, in sequence order. `states` can contribute to multiple fields at once.
  - `value`, the field event, `params`, and `query` are unique per field across the form. Declaring the same unique property twice, in two rule sets or in a rule set and inline, is an error that names the field and both locations.
  - Including the same rule set twice is also an error.
- **Rule-set composition preserves the engine's behavior.**
  - A rule set stores its already validated declarations. Each form places them in its sequence and compiles each occurrence with its own identity.
  - A form without rule sets compiles to the same result as it did before rule-set composition was introduced. A form with rule sets behaves like its inline twin, when one exists.

## Options considered

- **The last declaration of a unique property wins.** It reproduces the overwrite behavior of a spread, removes a rule based on its position, and hides the conflict.
- **Merge entries by field,** keeping the position of the first occurrence. There would always be an inline twin. This was rejected because one rule set's precedence would depend on the fields touched by an earlier one.
- **Merge two `onChange` events on the same field** into one event that combines their patches. This would require defining how to combine events and their writes. The composition cases considered are handled by distinct properties or events on different fields.
- **Compose per session,** based on context. The definition's query types would depend on the session, and the rules would have to be recompiled. [ADR 0005](0005-rows-identity-values-invalidation.md)
- **Nested rule sets.** They would add a level of composition and another way to determine order. An array of rule sets can be spread directly in `include`.
- **`rules` as an array of rule sets and rules.** This was rejected because it would turn `rules` into a union of object and array, putting inference and the current messages at risk.
- **Infer requirements from what the rules read.** TypeScript cannot do this. A parameter without a contextual type has an implicit `any`.

## Consequences

- Two rule sets with cross-writers on the same fields may have no inline twin because an object groups the properties of each field. Rule-set composition preserves the engine's ordering by property. The fuzz test that compares with the twin declares its domain.
- A conditional rule set that provides required parameters cannot be written. Without `rules` the parameters are missing, and in `rules` they collide. The alternative is a variant of the rule set that provides only the parameters.
- Variants that omit fields are out of scope. A rule set that requires an absent field cannot be included.
- The labels of a rule set's rules include their location, for example `(include[1])`.
- In the type system, `RuleSet` carries the requirements, queries, unique properties, and provided parameters. Exporting a rule set emits its declarations without naming internal types.

### Rule sequence

- **Rule-set composition and compilation.** `compileProperties` receives the sequence of sources and places already validated declarations with a single counter. Rule-set composition preserves the compiled result of forms that omit `include`. This was checked by comparing the output of the same compilation tests before and after rule-set composition was introduced.
- **Inline twin.** A differential fuzz test splits the rules of random forms into rule sets, by entry and by contribution, and compares each form with its inline twin through the session.
- **`RuleSet` is a simple alias with `any`.** The prototype's conditional alias resolved to the object and named its private key. TypeScript emitted TS4023 when exporting a rule set.
- **Keys for unique properties and provided parameters.** They use tuples in place of text labels, `["header", field, property]` and `["rows", collection, field, property]`. This keeps header field names distinct from row field names.

### Requirements and subtypes

A requirement compares the base type, so a rule set that requires a text field accepts a text subtype. The label, default value, subtype, and presentation of the form that includes the rule set apply. Only rule sets from the same `createForms` can declare a field of that subtype. [ADR 0007](0007-per-field-presentation.md)

### Events and members of a relation

`onChange` and `onEdit` share each field's unique event property, including across rule sets. A `relation` takes up the `value` and the event of its two members. `defineRules` rejects conflicts within a rule set. Form definition rejects conflicts between included rule sets and between an included rule set and inline rules. [ADR 0009](0009-direct-edits-mode-fields-and-driver-relations.md)

## Status

Decision accepted on October 9, 2026. [Collections and rule composition](../technical.html#capability-rows)
