# Validation, "dirty," and submission

## Context

A form needs to validate before submission, know whether it changed, and show the errors returned by the server. Declaring a required field separately for the view and for submission lets the two criteria diverge. Marking every write during opening as an edit makes the form appear changed from the start. Clearing all server errors when editing any field hides errors for other targets that are still current.

The session already brings together values and rules. It can provide a shared starting point from opening, prepare the submission of a particular edit, and withdraw each message when its target changes. [ADR 0001](0001-independent-core.md)

## Decision

- **Messages as contributions.**
  - `error` and `warning` are state properties with the lifecycle of `disabled` ([ADR 0002](0002-property-based-rule-authoring.md)). They are declared in rule entries, in `each`, and in `states` patches, and combined in declaration order.
  - A row, a collection, and the form have their own, in `rules.<collection>.row`, `rules.<collection>.collection`, and `form`.
  - `required` accepts a message. Its marker is the disjunction of the contributions, and its message comes from the last active contribution that includes one.
- **Built-in and derived validation.**
  - `required`, `min`, and `max` produce errors based on the combined state, using each type's empty value and inclusive limits. They do not prevent writes or change the value.
  - The core derives validation alongside publication, incrementally. A field is revalidated only if something that determines its validation changed, and derived states are shared across rows.
  - The application declares the message functions once in `createForms({ messages })`. These functions receive no field value.
- **Atomic application.** Messages, "dirty," and counters are calculated as a delta applied alongside the memory delta once the operation can no longer fail.
- **A fixed baseline until `commit`.**
  - "Dirty" compares with the baseline, which comes from opening, using each type's equality.
  - `prepare` captures an immutable prepared submission tied to its session. `commit(prepared, canonical)` turns it, together with the server's canonical values, into the new baseline.
  - The live state is resolved separately. It receives canonical values only where nothing changed after preparation and preserves later writes, using the last writer for each field.
  - Reset returns to the last baseline.
- **`prepare` waits only for what is declared.**
  - Queries needed for submission are marked with `forPrepare`.
  - There is one waiting attempt per session. A new `prepare`, an accepted reset, an abort signal, or a command that changes values or rows cancels it. The result is `ready`, `invalid`, or `cancelled`.
  - Problems are returned as `Issue` without naming fields in the types, so the session is covariant, `Session<out D>`.
- **External errors provide information.** `setErrors` and `setWarnings` replace what a source contributes, with messages located by field, collection, and row key. With `from`, they skip what changed after preparation. They do not block `prepare` and are withdrawn when their target changes.
- **The binding controls visibility.**
  - The core publishes full validity, touched, and the attempt. Both `showErrors` policies reveal local errors after an attempt in the relevant scope. The `"touched"` policy also reveals local errors for touched fields and rows. External errors and warnings are always shown.
  - The renderer keeps partially entered text. The core receives only its error, as pending input that blocks submission without making the state dirty.
- **No implicit exclusions.** No state removes a field from validation or submission. The application projects the payload.
- **A performance ceiling for each type of operation.** On a form with 40 fields, the accumulated additional cost of the capability was capped at +1 µs for an edit that nothing reads and for events, +5 µs for edits that run formulas or change an error, and +10 µs for opening.

## Options considered

- **Validate in the binding, on mounted controls.** Validity would depend on what is on screen, and virtualized rows would go unvalidated.
- **Traverse the entire form on each `prepare`.** It is simple, but it provides no live counters, traverses 24,000 cells per attempt, and separates the `required` marker from its validation.
- **Validate only when combining states.** Publication does not combine states again when only the value changes, so errors would become stale.
- **A whole-form schema as the only path.** It facilitates validator interoperability and lets the application decide when to validate and how to locate an error by row identity.
- **A baseline that moves with every response, or "dirty" against default values.** Moving it with a response could treat an edit as committed. Comparing with default values could mark data supplied at opening as changed.
- **A `commit` that only protects explicit canonical values.** A cascade loses an edit made after preparation.
- **Server errors nested by collection and row.** The shape rejects computed keys with a misleading message. With a list, translating the response is a `.map`.
- **Exclude hidden or disabled fields.** It depends on the domain. Hiding a field does not determine whether it is submitted.
- **A live summary of issues, with severity, source, and position.** Keeping a summary of 24,000 issues live costs milliseconds, and no need called for it. The summary comes from the `prepare` result and the counters.
- **Pending input as the second argument to `onChange`.** It mixes writing a value with reporting invalid text.
- **Collection errors in `rules.<collection>.error`.** They share the name with a field entry and cost 4,732 more instantiations than `collection`.

## Consequences

- The session stores indexes by target and caches of derived states. While at least one prepared submission can still be committed, it also stores revisions and the last writer for each field. This memory and internal complexity are accepted to avoid traversing fields on every operation.
- Each operation pays for deriving what changed, within the agreed ceilings.
- If a query changes a value after opening, that change counts when comparing with the opening baseline.
- Two visibility policies in one application call for two bindings.
- The types of the problems from `prepare` do not name fields from the definition.
- There are no two requirements on the same data, partial preparation, schemas, single-row reset, drafts, or focus.
- A renderer that ignores the new props neither shows messages nor reports its drafts.

### Validation and "dirty"

- **Atomic application is pure.** After combining states and before applying the memory delta, an operation derives the states it publishes and counts its validation scopes in new objects. An accepted operation publishes those results. A rejection can discard the whole candidate without undoing changes to mutable indexes.
- **A valid, clean state is published as its contributions combined it,** with `dirty: false` already present. The `required` message lives in a separate table outside the state. Only a field with a validation error or a dirty field publishes a copy, interned by combined state, result, and "dirty," so rows that shared states continue to share them.
- **Messages for rows, collections, and the form** are state formulas associated with no field, outside the lists used to combine fields. Each scope's counters are updated by differences in rows that changed. An operation that changed none of that keeps the existing counters. An operation that only changes properties that no message reads, such as a lock, neither compares nor counts again the rows it did not write.
- **Derived states and row scopes live in chunked maps.** With "dirty," the first change to a row changes its states, and copying an entire map for each one made that edit proportional to the number of rows. A new version of the map copies only the chunks it writes.

### Prepare and commit

- **The wait checks at the end of each publication.** Queries count their required in-flight requests, so checking costs O(1). A response in a batch retains its request until the batch closes. By the time `prepare` checks again at the end of the publication, any required request started by a batch response has already been counted.
- **`commit` does not cancel a waiting `prepare`.** Its canonical values come from the server, like a response, and `prepare` captures them.
- **The prepared submission copies memory at capture time, before the first subsequent edit.** The live memory moves to its own maps, and the prepared submission retains the earlier ones. The `params` and `queryParams` maps stay shared. They belong to the live state, and the prepared submission does not use them.
- **After a `commit`, reset requests again what did not arrive.** The prepared submission records the queries that were in flight or had failed at capture time, and the subsequent supplied values exclude them unless a canonical value wrote their field. On reset, they are requested again only if their parameters are defined. [ADR 0004](0004-async-lists-and-queries.md) gives the full rule.
- **The type of `Prepared` does not distinguish compatible definitions.** An invariant brand on `D` would conflict with the covariance of `Session`. A prepared submission from another definition with the same fields or more compiles, and `commit` rejects it at runtime.
- **The last writer comes from the attempt that completed.** Resolution records who wrote each field only while there are revisions, from the first `ready` capture until reset or until the last prepared submission is accepted. Rewinding erases what the undone step recorded.
- **"Dirty" is rebased by difference.** `commit` compares the previous baseline with the new one, comparing row records by identity first, and derives and counts the differences again within the operation on the live state. This keeps "dirty" relative to the current baseline and lets reset limit dirty recalculation to the fields whose values change.
- **The map of combined row states** moved to chunked maps, like derived states and scopes.

### Visibility, pending input, and the binding

- **Touched and pending inputs are markers that the engine derives, like "dirty."** Engine state stores markers by scope, for the header and each row. Derivation reads a field's marker only if its scope has any markers, so an edit pays nothing when there are none. A retained state persists as long as its marker stays the same. A marker derives only its address with a receipt that has no value changes. Reset clears the markers and derives what was marked again. This lets field state publish `touched`, and input messages appear in `errors` and the counters without a second index. `prepare` returns `invalid` without a mechanism of its own.
- **A row's touched marker belongs to the session,** like the attempt. It is a weak set of rows read by the snapshot of the row's handle, and touching a cell also adds its row to the set. Touching only a row does not run the engine.
- **An input's views belong to the session.** A registry of owners by address, in registration order, passes the list of messages from live views to the engine. A view lives until its `dispose`, which removes it from the registry, until reset, or until its row is removed. Touched and views share a session module.
- **The binding creates the controller with the first message, outside a mount effect.** Mounting 1,000 `Field` components does not register 1,000 owners, and StrictMode leaves none. The end of the `Field` subscription to its source disposes it, without an effect per `Field`. This lets a renderer that reports from its own mount effect, before subscription, retain its input. A controller from before a reset is left behind. If the field is hidden, or a message arrives after unmounting, the controller goes away in a microtask because the session does not accept reports during its notification.
- **The message is optional.** `error(message?)` and `onInputError(message?)` withdraw the message without an argument because repository lint rejects `f(undefined)`.

### External errors

- **External errors are markers that the engine derives, like touched and pending inputs.** Engine state stores by target what each source contributes and the two lists it publishes. Header fields and cells store them in their marker. Rows, collections, and the form store them in a separate map. Field state thus publishes `externalErrors`, warnings are combined, and counters count each target once.
- **Withdrawal happens in one place.** Each operation determines its markers by removing external messages from addresses whose current value changed. Addresses rebased by `commit` are unaffected by rebasing alone. Without external messages in the session it costs one comparison per operation, and with them it looks them up before copying. The session state stores only the order of its sources and where each one put its last list, by names and keys, once per target and without the texts, as a hint for where to look when replacing it. Reset clears the hint when the engine finishes restoring, so a failed reset does not desynchronize it.
- **Counting discovers which external messages of its own changed by comparing markers,** without any operation telling it. The markers retain the map of external messages for rows, collections, and the form as long as nothing in it changes, and a cell that changes can publish the same interned state. A row with markers on its cells must derive its combined states before publishing them because an external warning that repeats a local one gives the same content as the combined state.
- **`errorCount` counts local and external errors,** so it no longer determines the outcome of `prepare`. The command lists issues when any errors are counted and yields `invalid` only if it finds a local one. There is no need for a separate count of local errors.
- **`from` accounts for changes after capture.** Revisions also record the structure of each collection. A differential oracle compares which messages remain when reporting before or after a series of operations.
- **`from` is valid after the `commit` of its prepared submission until the next value change or a reset.** The window closes even if another prepared submission keeps the revisions. This allows warnings from an accepted save to be published without recording later changes for that prepared submission. Retaining its revisions until reset cost +0.7 to +1.4 µs per edit with 40 fields. Rejecting `from` at commit would prevent associating the warnings from the accepted save with the prepared submission.
- **What a `commit` writes comes from the server.** Merging another prepared submission and using `from` with the commit's own prepared submission skip those writes. Value changes do withdraw external messages and count for `from` on another in-flight prepared submission. Revisions record these changes separately with their `commit` number.
- **The derivation's scope cache skips scopes with external messages,** because a scope can return to its combined states without passing through the cache again, and the entry would retain the messages that went away.
- **The session remembers the keys it issued,** as ranges of sequences per collection, so it can skip a row that has already been removed and reject a key that never belonged to it, without retaining the rows.
- **`Issue<D>` uses the intersection of `{ message }` and the location.** Keeping the name `Issue` in declarations allows it to be exported from an application. A cell has a required `key: RowKey<N> | undefined`, so `sent.rows.lines[index]` compiles with `noUncheckedIndexedAccess` and omitting the key remains a type error.

### `onEdit` writes after preparation

An `onEdit` write after preparation counts for `commit` and `from` even if it repeats the value. The live state retains its value, the baseline receives the canonical value, and `from` skips messages arriving for that field. Messages already published are withdrawn based on actual changes to the target. If a formula replaces an explicit write from a canonical value, `commit` derives its state again even when the formula returns the same value it had. [ADR 0009](0009-direct-edits-mode-fields-and-driver-relations.md)

## Status

Decision accepted on October 29, 2026. [Validation, "dirty," and submission](../technical.html#capability-submission)
