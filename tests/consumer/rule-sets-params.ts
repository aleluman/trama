// Required params with rule sets, in types: a set always included gives them,
// and the form requires the rest in rules; without rules, the message says why
// they are left. The formulas of an entry whose params a set gives keep their
// context.
import type { DeepReadonly } from "trama-forms/core";
import { lotParams } from "./rows-queries.js";
import type { Product } from "./rows-async.js";
import {
  amounts,
  defineForm,
  defineRules,
  enabled,
  field,
  lots,
  sale,
  totals,
  type Equal,
} from "./rule-sets.js";

// A set always included gives them, also in a preset with as const and in an
// alternative whose members all give them.
const lotsOnly = defineRules({
  ...sale,
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
defineForm({ ...sale, include: [lots] });
defineForm({ ...sale, include: [...([lots, amounts] as const), totals] });
defineForm({ ...sale, include: [enabled ? lots : lotsOnly, amounts] });
// The rules of the form may add to lot without its params.
defineForm({
  ...sale,
  include: [lots],
  rules: {
    lines: {
      each: {
        lot: {
          hidden: ({ product }) => {
            void (true satisfies Equal<typeof product, DeepReadonly<Product> | null>);
            return product === null;
          },
          disabled: [({ warehouse }) => warehouse === null && "No warehouse"],
          readOnly: (_, { values }) => values.notes !== "" && "With notes",
          required: [() => true],
        },
      },
    },
  },
});

// Without a set that surely gives them, rules must: the message says why.
// @ts-expect-error field "lot" of "lines" needs params: give them in rules or in a rule set always included
defineForm({ ...sale, include: [amounts] });
// @ts-expect-error field "lot" of "lines" needs params: the rule set that gives them may be absent
defineForm({ ...sale, include: [enabled && lots] });
// @ts-expect-error field "lot" of "lines" needs params: the rule set that gives them may be absent
defineForm({ ...sale, include: [enabled ? lots : amounts] });
declare const maybe: readonly [typeof lots] | undefined;
// @ts-expect-error field "lot" of "lines" needs params: the rule set that gives them may be absent
defineForm({ ...sale, include: maybe });
const loose = [lots, amounts];
// @ts-expect-error field "lot" of "lines" needs params: a list without "as const" may lack the rule set that gives them
defineForm({ ...sale, include: loose });
// With rules, the entry the sets leave is required there.
defineForm({
  ...sale,
  include: [amounts],
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
defineForm({
  ...sale,
  include: [amounts],
  // @ts-expect-error Property 'lines' is missing: lot needs its params.
  rules: { total: { value: () => 0 } },
});
defineForm({
  ...sale,
  include: [amounts],
  // @ts-expect-error The entry of lot requires params.
  rules: { lines: { each: { lot: {} } } },
});
defineForm({
  ...sale,
  include: [],
  rules: {
    lines: {
      each: {
        lot: {
          // @ts-expect-error params cannot be undefined then.
          params: undefined,
        },
      },
    },
  },
});
// A set that does not touch lot leaves its entry and its params to rules,
// whose formulas keep their context.
defineForm({
  ...sale,
  include: [amounts],
  rules: {
    lines: {
      each: {
        lot: {
          params: lotParams,
          hidden: ({ product }) => product === null,
          disabled: [({ warehouse }) => warehouse === null],
        },
      },
    },
  },
});
defineForm({
  ...sale,
  include: [],
  rules: {
    lines: {
      each: {
        lot: { hidden: ({ product }) => product === null, params: lotParams },
      },
    },
  },
});

// The params of a field of the header named as one of a row are another
// field's: they do not give those of lot in lines.
const odd = field.async("lots");
const header = { ...sale.fields, 'lot" of "lines': odd };
const oddLot = defineRules({
  fields: header,
  collections: sale.collections,
  rules: { 'lot" of "lines': { params: () => ({ product: "", warehouse: "" }) } },
});
// @ts-expect-error field "lot" of "lines" needs params: give them in rules or in a rule set always included
defineForm({ fields: header, collections: sale.collections, include: [oddLot] });
defineForm({ fields: header, collections: sale.collections, include: [oddLot, lots] });

// A field of the header whose params are required, as in rows: a set that
// gives them lets rules add to its entry; without it, rules give them, and
// the formulas beside them keep their context.
const desk = {
  fields: { ...sale.fields, stock: field.async("lots", { label: "Lot" }), code: field.text() },
  collections: sale.collections,
};
const stockParams = ({ code }: { readonly code: string }) =>
  code === "" ? undefined : { product: code, warehouse: "central" };
const stock = defineRules({ ...desk, rules: { stock: { params: stockParams } } });
defineForm({
  ...desk,
  include: [lots, stock],
  rules: { stock: { hidden: ({ code }) => code === "", disabled: [({ notes }) => notes === ""] } },
});
defineForm({
  ...desk,
  include: [lots],
  rules: {
    stock: {
      params: stockParams,
      hidden: ({ code }) => code === "",
      readOnly: [({ notes }) => notes !== "" && "With notes"],
    },
  },
});
defineForm({
  ...desk,
  include: [lots],
  rules: {
    // @ts-expect-error The entry of stock requires params.
    stock: {},
  },
});
defineForm({
  ...desk,
  include: [lots],
  rules: {
    stock: {
      // @ts-expect-error params cannot be undefined then.
      params: undefined,
    },
  },
});
// @ts-expect-error field "stock" needs params: the rule set that gives them may be absent
defineForm({ ...desk, include: [lots, enabled && stock] });

// A field named by a number keeps its required params with include, in the
// header and in rows; a set that gives them covers them.
const numbered = { [-1]: field.async("lots") };
const numberedParams = () => ({ product: "", warehouse: "" });
// @ts-expect-error field "-1" needs params: give them in rules or in a rule set always included
defineForm({ fields: numbered, include: [] });
// @ts-expect-error field "-1" of "lines" needs params: give them in rules or in a rule set always included
defineForm({ fields: {}, collections: { lines: { fields: numbered } }, include: [] });
defineForm({
  fields: numbered,
  include: [defineRules({ fields: numbered, rules: { [-1]: { params: numberedParams } } })],
});
defineForm({
  fields: {},
  collections: { lines: { fields: numbered } },
  include: [
    defineRules({
      collections: { lines: { fields: numbered } },
      rules: { lines: { each: { [-1]: { params: numberedParams } } } },
    }),
  ],
});
