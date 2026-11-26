# Independent core and a single owner of state

## Context

A form combines values, rules, and operations that must be coordinated in the same way from the visual interface and from the core.

## Decision

Trama has no production dependencies except React as an optional peer dependency of the binding. The session is the single owner of state and exposes the same interface to applications, the binding, and tests. Stores, atoms, and internal representations stay inside the core.

## Options considered

- **Use TanStack Form as infrastructure.** It would provide some of the forms infrastructure at the cost of coupling state ownership and operation coordination to another library.

## Consequences

- The core maintains the minimum mechanisms each capability requires to control its contracts and handle coordination inside the session.
- Tax rules, business codes, transport, and persistence belong to applications and their services.
- The `devDependencies` are used to develop and verify the project. Including them in the distributed code would violate this policy.

## Status

Current decision. [Definitions and sessions](../technical.html#capability-define)
