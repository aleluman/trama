# Rule authoring by field property

## Context

Changing the customer on an order can update its address, clear the city, and recalculate the total. One rule per target would repeat the cause on each field. The way these rules are declared must also make it possible to find each field's computed properties.

## Decision

Each entry in `rules` describes a field's properties, like the props of a component.

- **Formulas by property.** A function of the form's values computes a property such as `value` or `disabled`. It can destructure the fields it reads.
- **Events.** They are declared on the field that triggers them, such as `onChange`, and return a patch for multiple fields.
- **Results.** `undefined` means no write or contribution.
- **Precedence.** Among rules that write to the same value, the last declared writer wins. `onEdit` also protects what its command wrote.
- **Dependencies.** Reads are tracked, and `peek` allows reading without creating a dependency.
- **Multiple fields at once.** There is no wildcard key. A computation that affects multiple fields uses an explicit patch, and the lock on the entire form has its own section.

Rule authoring preserves the priority of initial values, atomic failures, and state contributions. Derived outputs are computed separately from the rules.

## Options considered

Four approaches were prototyped in strict TypeScript 7.0.2 across nine scenarios involving formulas, events, and field properties. Grouping actions by target served as the starting point.

- **Actions grouped by target.** `derive`, `write`, and `reset` named the mechanism. The triggers for a write were repeated at each target and obscured which fields changed for the same reason.
- **Phrases organized by cause** (`on("country").reset("city")`). They read like prose and compose well, but their vocabulary grows with every need, and finding everything that affects a field requires going through the list.
- **Explicit typed references** (`f.total.derive([f.quantity, f.price], …)`). This is the most powerful option for rows and fragments, but it repeats each read, allows positional swaps, and would reopen almost every agreement, including tracked reads.
- **Minimal chain of two verbs** (`.derive(…).on(…)`). It has few concepts, but it applies a value when the result changes instead of when its reads change, and it replaces the `defineForm` sections with a chain.

## Consequences

- Rules receive values and tools for reading. An event's writes are returned as data.
- An event's targets are discovered when it runs. If it reveals a target that has already been resolved, the engine rebuilds the candidate from that step. The engine can invoke an event again if it read a value that later changed. Only the result computed from the final values is applied.

### Precedence between rule sets

"Last declared writer wins" applies to the sequence of declarations. The declarations from each set come first, in `include` order, followed by the inline rules. A unique property of a field is declared only once across the form. Two events from different fields that write to the same target are resolved by precedence. [ADR 0006](0006-variants-by-rule-sets.md)

### Decimals and limits

`decimals`, `min`, and `max` are combined like other scalar contributions. The last declared contribution wins, and `undefined` withdraws its rule's contribution. `null` removes the limit from earlier contributions. Consistency between the two limits is checked in the combined result for each field. [ADR 0007](0007-per-field-presentation.md)

### Direct edits and previous values

The `onEdit` patch respects what its command wrote, and `onChange` follows the general precedence rule. Both events receive `before`, which allows reading the values from the start of the operation without creating dependencies. With `relation`, the driver's entry declares the value formula and event for its two members. [ADR 0009](0009-direct-edits-mode-fields-and-driver-relations.md)

## Status

Current decision. [Rule authoring](../technical.html#capability-authoring)
