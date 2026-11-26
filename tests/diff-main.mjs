// Usage: pnpm run build; node tests/diff-main.mjs <built-base-tree> [forms per seed].
// With TRAMA_BASE set, omit the base argument (an optional count can still follow).
// Four seeds, 4,000 forms each by default. Relations are disabled.
// Set FUZZ_EDITS=1 for a base with onEdit and before; leave it unset for an older base.
import { baseOptions, compareFuzz } from "./helpers/fuzz-comparison.mjs";

await compareFuzz(baseOptions());
