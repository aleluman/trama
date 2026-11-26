// The queries of rule sets, in types: FormQueries and RowQueries join those
// of the rules and those of each set, optional where the set may be absent or
// declares them optional, so a read without ?. fails there.
import {
  createSession,
  type FormDefinition,
  type FormQueries,
  type QueryState,
  type RowQueries,
  type RuleSet,
  type Session,
} from "trama-forms/core";
import {
  amounts,
  defineForm,
  defineRules,
  enabled,
  lots,
  pricingRules,
  sale,
  totals,
  type Equal,
} from "./rule-sets.js";
import { lotParams } from "./rows-queries.js";

const priceParams = () => ({ product: "p1", list: "retail" });
// A query of the header in a set, one in rules, and one that a set may lack.
const totalQuery = defineRules({
  ...sale,
  rules: { total: { query: { endpoint: "linePrice", params: priceParams } } },
});
// A query that may be missing writes notes with a patch; discount takes the
// result as it is.
const toNotes = (price: number) => ({ notes: String(price) });
declare const maybeNote:
  | {
      readonly query: {
        readonly endpoint: "linePrice";
        readonly params: typeof priceParams;
        readonly patch: typeof toNotes;
      };
    }
  | undefined;
declare const maybeDiscount:
  | { readonly query: { readonly endpoint: "linePrice"; readonly params: typeof priceParams } }
  | undefined;
const maybeNotes = defineRules({
  ...sale,
  rules: { notes: maybeNote, lines: { each: { discount: maybeDiscount } } },
});
const composed = defineForm({
  ...sale,
  include: [lots, totalQuery, enabled && pricingRules, maybeNotes],
  rules: { priceList: { query: { endpoint: "linePrice", params: priceParams, patch: toNotes } } },
});
const queries: [
  Equal<
    FormQueries<typeof composed>,
    {
      readonly priceList: QueryState;
      readonly total: QueryState;
      readonly notes?: QueryState;
    }
  >,
  Equal<
    RowQueries<typeof composed, "lines">,
    { readonly price?: QueryState; readonly discount?: QueryState }
  >,
] = [true, true];
void queries;
const session = createSession(composed, { scope: "acme" });
void (session.getSnapshot().queries.total.status satisfies QueryState["status"]);
// @ts-expect-error Object is possibly 'undefined': notes may be missing.
void session.getSnapshot().queries.notes.status;
void session.getSnapshot().queries.notes?.status;
session.retry("total");
const [key] = session.getSnapshot().rows.lines;
if (key !== undefined) {
  const line = session.row("lines", key);
  // @ts-expect-error Object is possibly 'undefined': price may be missing.
  void line.getSnapshot()?.queries.price.status;
  line.retry("price");
}
// The sessions of a composed form are sessions of the wide definition.
const wide: Session<FormDefinition> = session;
void wide;

// A set present in every list of a union of lists gives its queries surely;
// one in some list only, optionally.
declare const either:
  | readonly [typeof lots, typeof pricingRules]
  | readonly [typeof lots, typeof totalQuery, typeof pricingRules];
const unionOfLists = defineForm({ ...sale, include: either });
const fromUnion: [
  Equal<FormQueries<typeof unionOfLists>, { readonly total?: QueryState }>,
  Equal<RowQueries<typeof unionOfLists, "lines">, { readonly price: QueryState }>,
] = [true, true];
void fromUnion;
// The wide RuleSet and a list without as const give nothing in types.
const all: readonly RuleSet[] = [lots, pricingRules];
const wideList = defineForm({
  ...sale,
  include: all,
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
const looseList = [lots, amounts, totals];
// @ts-expect-error field "lot" of "lines" needs params: a list without "as const" may lack the rule set that gives them
defineForm({ ...sale, include: looseList });
const fromWide: [
  Equal<FormQueries<typeof wideList>, {}>,
  Equal<RowQueries<typeof wideList, "lines">, {}>,
] = [true, true];
void fromWide;
