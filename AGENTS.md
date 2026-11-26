# Trama

## Scope and contracts

- The package targets modern browsers. Node is used for development and test tooling.
- Before changing behavior or the interface, read `CONTEXT.md` for vocabulary and the relevant chapter of `docs/technical/content.html` for decisions, contracts, and status. Proposals do not constitute implemented capabilities.
- Follow the dependency and state ownership policy in `docs/adr/0001-independent-core.md`. Each capability must solve a concrete need. Avoid extensions or adapters without a concrete application that uses them.
- `src/core/index.ts` and `src/react/index.ts` are the public entries. The binding accesses the core through its public entry. The behavior tests exercise the same public interface as applications.
- The interface includes configuration, the order of operations, errors, and invariants, as well as types. Keep coordination inside the module and verify that the built package works when imported by a project.
- Write documentation, code, tests, and commits in English.

## Closing a capability

1. Agree on the case, public example, limits, and observable criteria before implementing a slice.
2. Run `pnpm run check` and the relevant behavior checks. If there is a UI, verify its interactions in a browser. Distinguish mocks, actual execution, and historical evidence.
3. Update the current source in `docs/technical/content.html`. Replace proposals with the contract and actual examples, record tests, limits, and the version or revision, close resolved questions, and remove discarded alternatives. Keep applicable restrictions.
4. If the public interface changes, update the `docs/site/` guide with a brief explanation and an executable example whose file is shown beside its demo, with "Try it" steps verified in a browser. The guide documents only what is implemented. Design, proposals, and evidence belong in the technical document.
5. Regenerate with `pnpm run docs:build` and verify with `pnpm run docs:check`. The source and `docs/technical.html` must change together. The generator reads only sources and assets within `docs/technical/`.
6. Keep `CONTEXT.md` exclusively as a glossary. Create an ADR only for a relevant architectural trade-off. Git history preserves documentation changes without accumulating reports in the current document.

Publishing and deployment require instructions separate from setting up or closing a slice.
