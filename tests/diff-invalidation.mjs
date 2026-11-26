// Usage: pnpm run build; node tests/diff-invalidation.mjs [forms per seed].
// Copies the build to a temporary directory; neither source nor dist is modified.
// Four seeds, 4,000 forms each by default, with onEdit, before and relations.
// Compares values, states, publications and first failures against full traversal.
// The oracle checks agreeing steps and counts targeted passes, including those
// where a command activated the derived member of a row by writing it, with
// all its reads unchanged, whether it repeated the value or not.
import { compareFuzz, formCount } from "./helpers/fuzz-comparison.mjs";

await compareFuzz({ forms: formCount(process.argv[2]), full: true, validate: true });
