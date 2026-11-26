# Rows: opaque identity, per-row values, and targeted invalidation

## Context

An order has rows whose rules can read header fields. The application can add, remove, move, or duplicate them from a table or a modal. If a row is identified by its index, reordering it can trigger rules, direct a pending response to another row, or restore data to the wrong position on cancellation. Length is also insufficient to detect an addition in an operation that removes and adds rows. A persisted ID may be missing while a new row is being edited.

The September 28, 2026 Trama profile emulated rows with flat fields.

- With 1,000 rows of 24 fields, a keystroke took 10 to 20 ms of engine time, depending on the run, and 7 to 14 ms after the first improvement. React alone took 0.3 ms.
- The cost came from copying the whole values object and traversing every field on every operation. The rules did not account for that time.
- Without the copy, an edit still took 3.4 to 6.7 ms, and the cost still grew with rows the edit did not touch.

## Decision

- **Opaque identity.** Each row receives a row key when created. It is a string branded by collection, unique in the page's global scope, and never reused. It is distinct from both the position and the persisted ID. Moving a row leaves its values unchanged, and reset restores the baseline's keys.
- **Per-row values.** The collection stores the order of its keys and a frozen record per row, with structural sharing. An edit copies the row and its collection's arrays, not the form. For each collection, the snapshot publishes values and states in visual order, with keys in the same order.
- **Field addresses are internal.** A single module names a header field or a row field, and that name is the key for values, states, reads, and contributions. The application names a row field with a row handle, without text paths or tuples. Rules receive no handles. They write to other rows with a patch nested by collection and key.
- **The handle connects the core and the binding.** It provides `getSnapshot`, `subscribe`, and `edit` for its row's fields. `Field` accepts it as a source.
- **Targeted invalidation with the same semantics.** The targeted traversal limits the work on resolution, observers, states, outputs, and memory to what the operation affects. The full traversal serves as an oracle and as a fallback when invalidation positions cannot be represented exactly. Both traversals must produce the same values, the same first failure, and the same applied events.
- **Rules are compiled once.** A row rule is a template shared by all row instances. Its place in `rules` determines precedence, independently of the row's visual position.

## Options considered

- **Flat fields with compound names** (`l12_price`). These are what the profile measured. Copying and traversing them dominates the cost, and identity is embedded in a name that must be parsed.
- **Identity by index or persisted ID.** The index changes when a row moves. The persisted ID can be missing in additions and can be duplicated when another row's data is duplicated.
- **Public addresses as text paths** (`"lines.3.price"`). They make the index part of identity and require parsing the text.
- **Public addresses as tuples** (`["lines", key, "price"]`). A new array on every render breaks `Field`'s `memo`, type errors are long, and the address becomes public.
- **The collection as a field type** (`field.collection` inside `fields`). Every place that traverses value fields, from the renderer registry to `edit`, would have to exclude it. A separate `collections` section was chosen. Its rows compile with the same functions as fields.
- **Per-row storage without invalidation.** It misses the budget with 1,000 rows because traversing all fields still scales with the number of rows.

## Consequences

- The cost of an operation depends on what it affects, plus copying the collection's arrays and notifying all mounted `Field` components. Each `Field` selects its value in O(1).
- The session retains the memory and handles of baseline rows so reset can restore them with their identity.
- A key from another collection is rejected by the type system. A computed key loses its brand in a patch, and runtime rejects it there, just as it rejects a key from another session.
- Resolution resumes the attempt for each target discovered late. Restarting the whole attempt each time would cost N traversals for a cascade from the header to N rows.
  - The attempt returns to the first step that resolved the target because the next attempt would have repeated the earlier steps in the same way. Resuming at that step produces exactly the same result as restarting the whole attempt.
  - Learning multiple targets per attempt changed which operations were accepted. The result depends on the order in which the writers for each field are learned.
  - A cascade whose row events write to a field already read by a header formula, such as a total, is still quadratic.

### Targeted invalidation

- Each formula, observer, and output is indexed by the addresses it read. An operation visits the fields its change reaches through that index, in the order of the full traversal. A field it does not reach is settled without running anything when another field reads it.
- A target that an event reveals outside the affected set is added along with its readers. If the full traversal would have already settled it, the attempt returns to that step.
- Failures, false cycle precedence, and deferred completeness are handled in the same traversal. Repeating the work in the full traversal would change the number of invocations and what rules that catch errors observe, even in successful operations.
- Differential fuzzing and permutation sweeps checked agreement with the oracle on values, states, keys, outputs, the first failure, and applied events. In the Trama measurement with 1,000 rows of 24 fields, the latency budget was met, and editing a field that nothing reads cost the same as with 100 rows. The index and positions took about 2.3 MB altogether.

### Remote select and queries in rows

A remote field's parameters are stored by field address. A write adopts the option against the value at that address. Each query has its own generation per row. Removing the row invalidates its pending work, and moving it preserves that work. Responses are batched with those from the header. A query's cache key still consists of scope, endpoint, and parameters. [ADR 0004](0004-async-lists-and-queries.md)

## Status

Current decision. [Collections and rows](../technical.html#capability-rows)
