# Trama

Declarative forms library for modern browsers. A definition declares fields, rules between them, and derived outputs. A session holds the values for an edit, runs the rules on every change, and publishes snapshots. Each entry in `rules` describes a field by its properties. It can specify a value formula, the field's state (disabled or read-only with reasons, hidden, required, label, and placeholder, including for multiple fields at once), and what happens when the field changes. The `form` section locks the whole form except for its exceptions. An async field selects its option from an endpoint in the application's registry, page by page or from a complete list, and the complete option is its value. `trama-forms/core` has no dependencies. `trama-forms/react` adds `Field`, `useFormSession`, outputs, loading with TanStack Query, and a loader that shares its cache, and requires React 19.3 as an optional peer dependency.

```ts
import { createSession, defineForm, field } from "trama-forms/core";

const line = defineForm({
  fields: {
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Price", default: 10 }),
    total: field.number({ label: "Total" }),
  },
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
  },
});

const session = createSession(line);
session.edit("quantity", 3);
session.getSnapshot().values; // { quantity: 3, price: 10, total: 30 }
```

## Installation

```sh
npm install trama-forms
```

The public entries are `trama-forms/core` and `trama-forms/react`, which point to `dist` and never to `src`. `trama-forms/core` has no dependencies. `trama-forms/react` needs React `^19.3.0`, an optional peer dependency that applications using it install themselves. Trama uses the MIT license. See [LICENSE](LICENSE).

## Interactive guide

```sh
pnpm install --frozen-lockfile
pnpm run docs:dev
```

Open http://127.0.0.1:5173. The guide (`docs/site/`) explains fields, sessions, React, loading with TanStack Query, value formulas, events, field state, remote select, outputs, a complete example, the API, and errors and limits. Each example shows the file that runs the demo beside it, with steps to try it. The guide documents only what is implemented.

`pnpm run docs:dev` builds Trama, and the guide uses the public entries from `dist`. To rebuild the library while editing `src/`, run `pnpm run build:watch` in another terminal. If a definition changes during HMR, reload the page. `pnpm run docs:site` builds the guide in `.artifacts/site/` and `pnpm run docs:preview` serves it at http://127.0.0.1:4173.

## Development

The pnpm version is pinned in `packageManager`, and dependencies are pinned in `pnpm-lock.yaml`. Use Node 26.9.0 (`.node-version`) or later and pnpm 12.4.2. Node is used for development and verification and is outside the runtime contract. There is no guarantee of support for CommonJS, SSR, or older browsers.

```sh
pnpm run check
```

`check` builds and type-checks the library, then type-checks the guide, and runs linting, format checks, tests, the guide build, and the generated technical document check, in that order. Run the steps individually with the following commands.

```sh
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
```

- **Build.** TypeScript builds the core and the declarations. The build distributes the binding compiled with React Compiler through `oxc-transform-react` 0.145.0, without Babel. The binding uses `react/compiler-runtime`, which ships with React 19. The native compiler is experimental, and its version is pinned alongside `@vitejs/plugin-react` 6.1.1.
- **Lint and formatting.** [Oxlint](https://oxc.rs/docs/guide/usage/linter/config) with type-aware analysis (`oxlint-tsgolint`) treats the `correctness`, `suspicious`, `pedantic`, and `perf` categories as errors and rejects unused suppressions. [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats the code. In `docs/site/`, the `react-perf` rules for new props are disabled because React Compiler memoizes the guide. The Hooks rules remain enabled.
- **Tests.** `node:test` tests the actual core, React, and TanStack Query with controlled transport, and the definition of the guide's complete example. The package test installs a `.tgz` in an isolated project, runs the core without React, checks the typing of valid and invalid uses, verifies that internal imports are rejected, and builds the guide against the installed package. Artifacts are kept in `.artifacts/package-check/`.
- **Continuous integration.** GitHub Actions runs `pnpm run check` on every pull request and on every push to `main` (`.github/workflows/ci.yml`).
- **Releases.** Releases come from `aleluman/trama`. Set the version in `package.json` and push a matching tag, such as `v0.1.1`. The release workflow (`.github/workflows/release.yml`) checks that the tag matches the version, runs `pnpm run check`, and packs the package. If that version is not on npm yet, a separate job publishes the tarball through npm trusted publishing, with provenance. On npmjs.com, the trusted publisher names this repository, the `release.yml` workflow, and the `npm publish` action, and provenance requires the repository to be public. Version 0.1.0 is published by hand, because trusted publishing can only be configured for a package that already exists.

## Project documentation

- [Interactive guide](docs/site/) on using the library, with demos. Open it with `pnpm run docs:dev`.
- The technical document records the current contracts, limits, decisions, and performance. `pnpm run docs:build` generates standalone HTML, and `pnpm run docs:check` checks that it is up to date. [Technical document](docs/technical.html) · [Source](docs/technical/content.html)
- [CONTEXT.md](CONTEXT.md) is the glossary.
- [AGENTS.md](AGENTS.md) contains the working rules.

### Architecture decisions

- Dependencies and state ownership. [ADR 0001](docs/adr/0001-independent-core.md)
- Rule authoring by field property. [ADR 0002](docs/adr/0002-property-based-rule-authoring.md)
- Typed endpoint registry. [ADR 0003](docs/adr/0003-endpoint-registry.md)
- Lists per view and queries with generations. [ADR 0004](docs/adr/0004-async-lists-and-queries.md)
- Row identity, per-row values, and targeted invalidation. [ADR 0005](docs/adr/0005-rows-identity-values-invalidation.md)
- Variants by composing rule sets. [ADR 0006](docs/adr/0006-variants-by-rule-sets.md)
- Subtypes, values, and limits. [ADR 0007](docs/adr/0007-per-field-presentation.md)
- Validation, "dirty," and submission. [ADR 0008](docs/adr/0008-validation-dirty-and-submission.md)
- Direct edits, mode fields, and bidirectional relations. [ADR 0009](docs/adr/0009-direct-edits-mode-fields-and-driver-relations.md)
