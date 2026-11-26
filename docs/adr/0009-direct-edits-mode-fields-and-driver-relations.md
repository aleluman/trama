# Direct edits, mode fields, and relations by driver

## Context

In a business form, a rule may need to distinguish a direct edit from a derived write, read the state before the operation, or know which field determined the result. These differences arise when applying the following rules.

- Editing the debit clears the credit, without that clearing triggering the event on the other side again.
- A total retains the manually entered value until the person returns to the calculation.
- An address is filled in from the customer only if it was empty at the start of the operation.
- Of two editable fields, such as the amount and percentage of a discount, the one the person edited is retained and the other is derived.

The session is still the single owner of state. The application decides what is retained as domain data and provides the formulas and the meaning of the empty value, as specified in [ADR 0001](0001-independent-core.md).

## Decision

- **The cause comes from the command.** A direct edit is a field that `session.edit`, `row(...).edit`, or `session.patch` writes and changes according to its type's equality. Other rules, queries, opening, adding a row, reset, and canonical values do not make direct edits.
- **One event per field.** `onEdit` is a property of the entry. A field may declare either `onChange` or `onEdit`, with at most one event per field. `onEdit` runs when its field is a direct edit. It reads the command's value without waiting for the resolved value or creating a dependency on its own field. Its patch cannot replace any field that the command wrote, even if the command repeats its value.
- **Previous values in events.** Both events receive `before`, which is read-only and does not create dependencies. The application can check there whether a field was empty. Resolution retains the same view of previous values if it invokes the event again.
- **The override is a mode field.** The event marks it, and the formula or query parameters read it. Change the mode to return to the calculation. The application decides whether to save it. The field uses the same opening, reset, and submission as any field.
- **The mode survives a save with the edit that marked it.** An `onEdit` write after preparation counts for `commit` even if it repeats the value. The live state retains that write, the baseline receives the canonical value, and `from` skips external messages arriving for that field. That write alone does not withdraw messages already published. The protection of `onChange` still depends on the value changing.
- **The relation is declared on its driver field.** The driver stores the member that is retained. With an empty driver, the default member drives. The other is the derived member. `relation` compiles to a `value` and an `onEdit` per member. If a command changes both members and omits the driver, the default member's event breaks the tie. Generated events respect a driver written by the same command.
- **The derived member's formula triggers on its own conditions.** It runs when a read changes or when a command writes the derived member in an operation with differences. The formula can skip the write with `undefined`. Writes from other rules follow declaration order. Responses and canonical values enter as supplied values, and the formula replaces them if it runs. Supplied values take precedence at opening and when adding a row.

## Options considered

- **Declare event targets.** This avoided rewinding resolution. It required another property on every event, rejected cases allowed by dynamic discovery, and increased invalidation work as the number of rows grew.
- **An `edited` flag in the `onChange` context.** It saved a property but hid the cause in the event body. Forgetting the guard caused a silent change.
- **`override` and `resume` as session state.** They simplified expressing the rules and required new contracts for saving, opening, resetting, and committing the submission.
- **The driver as session state.** It required coordinating that state with saved values, the baseline, and query parameters. As a field, the application can supply, read, and save it through the current interface.
- **Write the relation pattern by hand.** It spread the relation across the members and the driver. Each author had to apply the same precedence and read the pair lazily to avoid a cycle when destructuring.

## Consequences

- The one-event limit per field also applies when composing rule sets. The relation takes up the event and value formula of its two members. Other rules retain the agreed declaration order. [ADR 0002](0002-property-based-rule-authoring.md) · [ADR 0006](0006-variants-by-rule-sets.md)
- The mode field and driver appear in the values and the prepared submission. Their changes count toward "dirty." A driver supplied at opening must correspond to a member or the field's empty value.
- A command with differences can recalculate the derived member of a supplied pair. Another rule that writes only the derived member can leave the pair inconsistent until a read changes. Setting a member from that rule also requires writing the driver.
- The core handles coordination of events and formulas. Forms without `onEdit` skip command captures. The additional triggering is limited to relation formulas. Both costs count toward the current budgets.

## Status

Decision accepted on November 24, 2026. [Direct edits and bidirectional relations](../technical.html#capability-edits)
