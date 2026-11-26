// Usage: pnpm run build; node tests/validate-oracle.mjs <built-base-tree> [forms per seed].
// Four seeds, 4,000 forms each by default, without relations. With TRAMA_BASE set, omit
// the base argument. Set FUZZ_EDITS=1 for a base with onEdit and before.
// The agreeing prefix of each run certifies the oracle, including response batches.
import { baseOptions, compareFuzz } from "./helpers/fuzz-comparison.mjs";

await compareFuzz({ ...baseOptions(), validate: true });
