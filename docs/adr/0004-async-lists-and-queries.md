# Async behavior: lists per view and queries with generations in the session

## Context

A form can work with two kinds of remote data.

- **Option lists.** A person browses them when making a selection, using search and pages. They belong to each view because two views of the same field can search for different things, and they do not write to the session.
- **Value queries.** They write to fields when their responses arrive. Core operations must be able to invalidate them when editing the target, changing the parameters, or resetting.

A query can fill in a product's initial price or update it when the selection changes. If each case defines its key and criteria for suspending the request separately, both can request the same thing and handle missing parameters differently. Invalidating only when scheduling another query lets a pending response replace a manually edited price.

## Decision

- **Lists per view, with their state machine in the core.** `session.list(name)` creates a list for each view. The list requests pages, discards responses from another attempt, removes duplicates, and filters complete lists. It neither writes to the session nor uses generations. The binding only consumes it.
- **Queries with generations in the session.** A field's `query` rule starts its query from the session.
  - Each entry has a generation. A change to or suspension of its parameters, a change to the entry's field, a reset, and a retry invalidate it.
  - A response is also discarded if any of its targets changed after the query started.
  - Each batch of accepted responses is applied as one core operation.
- **One loader, one key, and one suspension mechanism.** Both paths make requests through the same loader and use the canonical key built by the core, `["trama", scope, endpoint, params]`. For paginated endpoints, the search and page are added. In both paths, undefined `params` suspends the request. The direct loader has no cache, and the TanStack Query loader shares the application's cache. [ADR 0003](0003-endpoint-registry.md)
- **The opening epoch is separate from generations.** The `Opening` attempt has different triggers (activation, key, and retry) and remains in the binding.

## Options considered

- **Everything in the core, with search as session state.** Rejected because two views of the same field would share search and pages.
- **A core that only builds requests, plus `session.resolve(...)` to accept responses.** Each application that uses the core directly would need to coordinate requests, discards, and retries.
- **The list state machine in the binding.** Rejected because response discards and pages could be tested only with React, and the key would be built in two places.
- **Generations in the binding, alongside the opening epoch.** Rejected because the core operations that must invalidate them are invisible to the binding.

## Consequences

- A query pending at opening starts when the session is created. In StrictMode, a discarded session also issues queries. TanStack Query deduplicates equivalent requests, and the direct loader runs them separately.
- The session interface adds `list`, `retry`, and `snapshot.queries`. Parameters are not published.
- Invalidating an entry in TanStack Query does not refresh an open list. It is refreshed when opened, when searching or requesting more, or when its parameters change.
- Each row query has its own generation, tied to its row key.

### Queries in the header

- **Generation.** It is the current request for each entry, without a counter. A response counts only if it is for that request. The triggers in the decision invalidate it, with one qualification. The accepted response to a query changes its entry's field, but does not invalidate itself because its request has already finished. Invalidation aborts the signal, and the guarantee comes from the check when the response arrives.
- **Targets.** The session numbers the operations that change values, and each field stores the number of the last operation that changed its value, even if it returns to the prior value. An entire response is discarded if any target in its patch has a number later than the start of the query. Since only a live request compares these numbers, they are recorded while at least one request is live. Reset invalidates them all. They are not published, and the engine has no knowledge of them.
- **Response as an operation.** An accepted response is an engine operation, `{ kind: "resource" }`, that runs as an edit to the fields in its patch. The formulas, events for the fields that changed, state, parameters, and outputs run, and the result is published once through the same path as an edit, without changing `resetVersion`. Its cause is internal.
- **Parameters.** A query's parameters run with the state formulas, like those of an async field. Canonicalization reuses the same parameter object while its data remains equal, so the session compares it by identity with the most recent requests.
- **Specific consequences.**
  - When created, the session starts queries with defined parameters whose fields were not supplied. Reset applies the same criteria using the baseline. The discarded session in StrictMode finishes its requests and writes only to itself. The test with real TanStack Query verifies that `queryLoader` deduplicates the opening request. [React opening test](../../tests/queries-react.test.mjs)
  - In addition to `list`, `retry`, and `snapshot.queries`, `FormDefinition` adds a fourth type parameter with the state of each query, so `snapshot.queries` and `retry` name only the entries that declare a query.

### Queries in rows

- **The row is part of the generation's identity.** Each (query, row) pair is an entry with its own current request. It starts with its row, at opening, in an `add`, or on reset, and removing the row invalidates it when the `remove` is committed. Moving the row leaves it alone.
- **Targets by address.** While there is a request in flight, each field that a response can write stores the number of the last operation that changed it. These fields are in the header and the rows with queries. A row response compares only the fields in its own row.
- **Response as an operation.** The patch uses its own row's addresses. When following up an operation, the session goes through the queries in the header and those in the affected rows.

### Response batches

- **Batch as an operation.** The first response schedules a microtask to close the batch. The batch gathers the responses that arrive before it closes, including errors and discards, and publishes once.
- **Generation and revisions.** Each response is checked on arrival and again when the batch closes. Its request remains in flight while it waits, so its targets' revisions continue to be recorded.
- **Fallback.** If the batch operation fails, each response is reconsidered separately, in arrival order, with the patch it prepared on arrival.
- **Declared differences from applying responses one at a time.**
  - One publication per batch.
  - An event triggered by multiple responses is applied once.
  - The second write to the same field is discarded even if the first did not change it.
  - The patch reads the values published before the batch.
  - What one response writes does not invalidate another response in the same batch, either through the field of its entry or through what its parameters read. The operation's follow-up stops or requests the affected query again afterward. Preserving invalidation between responses in a batch would require queries to know what each parameter formula reads.

### Remote multi-select

`multiAsync` uses the same contract for its lists per view, parameters, and queries. An `endpoint.list` query without a `patch` writes its result to the `multiAsync` that declares it. [ADR 0007](0007-per-field-presentation.md)

### Required queries and supplied values

- `prepare` waits for in-flight requests for queries with `forPrepare`, in both the header and rows, including those declared by rule sets. It also waits for their batch to close. In-flight requests are counted, and preparation looks up the required ones whose last request failed. The command validates its options before canceling the pending preparation and marking the attempt. If the signal is already aborted, it leaves the marker and resolves to `cancelled`. A successful reset cancels the wait. If it fails while resetting, it retains the pending preparation, queries, and markers. If the function that generates the text for a required query fails, the promise rejects with the diagnostic and the cause of the failure. [ADR 0008](0008-validation-dirty-and-submission.md)
- Reset uses the supplied fields from the baseline for the header and rows. After a `commit`, the baseline supplies the committed fields. A query that was still in flight or had failed at capture is requested again on reset only if its parameters are defined and the canonical values omitted its entry's field. A canonical value for another field may suspend it by changing what its parameters read.

## Status

Current decision. [Remote select and queries](../technical.html#capability-async)
