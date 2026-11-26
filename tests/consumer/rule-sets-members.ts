// The lists include takes, in types: tuples and presets with as const,
// spreads, loose lists, open rests, conditional elements, alternatives
// between families, an include that may be missing and the wide RuleSet.
import {
  declareContext,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
  type FormQueries,
  type QueryState,
  type RowQueries,
  type RuleSet,
} from "trama-forms/core";
import {
  amounts,
  defineForm,
  discountedAmounts,
  enabled,
  lots,
  pricingRules,
  sale,
  salePreset,
  sentLock,
  totals,
  type Equal,
} from "./rule-sets.js";
import { lotParams } from "./rows-queries.js";

// A preset with as const is checked element by element, also spread.
defineForm({ ...sale, include: salePreset });
defineForm({
  ...sale,
  context: declareContext<{ sent: boolean }>(),
  include: [...salePreset, sentLock],
});
defineForm({
  ...sale,
  // @ts-expect-error field "amount" of "lines" value is declared by another rule set
  include: [...salePreset, discountedAmounts],
});
// A loose list is checked as a whole, against the rules of the form; it
// gives no params, so rules give them.
const loose = [amounts, totals];
defineForm({
  ...sale,
  include: loose,
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
defineForm({
  ...sale,
  // @ts-expect-error field "amount" of "lines" value is declared in rules too
  include: loose,
  rules: { lines: { each: { lot: { params: lotParams }, amount: { value: () => 0 } } } },
});
// An open rest is a list of unknown length: the rest gives nothing surely,
// and the elements fixed before it do.
declare const rest: readonly (typeof amounts | typeof totals)[];
const prefixed = defineForm({ ...sale, include: [lots, pricingRules, ...rest] });
const fromPrefix: Equal<
  RowQueries<typeof prefixed, "lines">,
  { readonly price: QueryState }
> = true;
void fromPrefix;
declare const lotsRest: readonly (typeof lots)[];
// @ts-expect-error field "lot" of "lines" needs params: a list without "as const" may lack the rule set that gives them
defineForm({ ...sale, include: [pricingRules, ...lotsRest] });
// A literal false gives nothing and requires nothing.
defineForm({ ...sale, include: [lots, false, null, undefined] });
defineForm({
  ...sale,
  // @ts-expect-error field "lot" of "lines" params is declared in rules too
  include: [lots, ...rest],
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
// An alternative between families keeps the requirements of both: neither is
// reduced to the other.
const wide = coreRules({
  fields: { notes: coreField.text(), rate: coreField.number() },
  rules: {},
});
const narrow = coreRules({ fields: { notes: coreField.text() }, rules: {} });
coreForm({
  fields: { notes: coreField.text() },
  // @ts-expect-error rule set requires field "rate"
  include: [enabled ? wide : narrow],
});
coreForm({
  fields: { notes: coreField.text(), rate: coreField.number() },
  include: [enabled ? wide : narrow],
});
// An include that may be missing is accepted and gives nothing surely: the
// params of lot come from rules, and its sets cannot declare them too.
declare const maybe: readonly [typeof amounts, typeof pricingRules] | undefined;
const optional = defineForm({
  ...sale,
  include: maybe,
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
void optional;

// With explicit type arguments include is not checked, and the form requires
// the params as without sets.
coreForm<{ notes: ReturnType<typeof coreField.text> }>({
  fields: { notes: coreField.text() },
  include: [wide],
});
// A helper that returns the wide RuleSet: only defineForm checks it, when it
// runs.
const choose = (discounts: boolean): RuleSet => (discounts ? discountedAmounts : amounts);
const chosen = defineForm({
  ...sale,
  include: [lots, choose(enabled), totals],
});
const nothing: Equal<FormQueries<typeof chosen>, {}> = true;
void nothing;
