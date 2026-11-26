# Typed endpoint registry per application

## Context

Several forms can use the same remote sources, such as customer and account catalogs or exchange rate services. An untyped reference by key leaves it to the author to verify that the endpoint exists and manually repeat the types of the parameters and the data associated with its options.

## Decision

- **Declaration by module.** Endpoints are declared with `defineEndpoints` in domain modules, without React or TanStack Query. `endpoint.options` paginates and searches on the server, `endpoint.list` returns a complete list with local search, and `endpoint.value` returns a value for a query.
- **One registry per application.** Registries are merged once with `createForms({ endpoints })`, which returns `defineForm` and `field` bound to the registry. A duplicate key across registries is a type error and a runtime error.
- **Reference by key.** Async fields reference endpoints by key, as in `field.async("customers", config)`. The endpoint determines the types of the parameters and option data. The factory rejects unknown keys, and the bound `defineForm` resolves the stored key.
- **Cache outside the core.** `createSession` uses the direct loader by default. `trama-forms/react` provides `queryLoader(client)`, which shares TanStack Query's cache and can be passed to `createReactBinding(renderers, { loader })`. [ADR 0001](0001-independent-core.md)

## Options considered

- **Source objects imported into each field.** They have the same typing and allow the source to be declared directly. The registry brings together sources that many forms share and makes their keys available as data.
- **Untyped keys.** They simplify the registry declaration at the cost of losing checks on keys, parameters, and option data.

## Consequences

- Definitions with remote fields import `defineForm` and `field` from the module that sets the registry. The `trama-forms/core` entries still serve forms without endpoints.
- A complete list is requested through the loader when opened and when its parameters change while the list is active. Search filters it locally. Lists per view and query generations have their own decision. [ADR 0004](0004-async-lists-and-queries.md)
- Remote fields accept option endpoints. `endpoint.value` is reserved for queries.
- `createForms` also accepts subtypes. The factory for a subtype with a remote base takes its endpoint key as a positional argument, just like `field.async`. A remote multi-select, `field.multiAsync("families", config)`, stores the complete options. [ADR 0007](0007-per-field-presentation.md)

## Status

Current decision. [Remote select and queries](../technical.html#capability-async)
