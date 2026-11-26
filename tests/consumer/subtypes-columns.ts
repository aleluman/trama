// OptionKey in the presentation of remote subtypes: each field checks its
// columns against the option of its own endpoint, in arrays, tuples, objects
// and optional members, single and multiple.
import { createForms, defineEndpoints, endpoint, subtype, type OptionKey } from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expect = <T extends true>() => undefined as unknown as T;

const catalog = defineEndpoints({
  people: endpoint.options(() =>
    Promise.resolve({
      options: [{ value: 1, label: "Ada", credit: 100, region: "South" }],
      more: false,
    }),
  ),
  places: endpoint.list(() => Promise.resolve([{ value: "mad", label: "Madrid", zone: 1 }])),
});
const { field } = createForms({
  endpoints: [catalog],
  subtypes: {
    search: subtype.async<{ columns: readonly { key: OptionKey; title?: string }[] }>(),
    many: subtype.multiAsync<{ columns: readonly OptionKey[] }>(),
    pair: subtype.async<{ columns: readonly [OptionKey, OptionKey] }>(),
    nested: subtype.async<{
      optional?: { keys: readonly OptionKey[] };
      pick: { key: OptionKey };
    }>(),
  },
});

const customer = field.search("people", {
  presentation: { columns: [{ key: "label" }, { key: "credit", title: "Credit" }] },
});
expect<
  Equal<
    (typeof customer.presentation.columns)[number]["key"],
    "value" | "label" | "credit" | "region"
  >
>();
const place = field.search("places", { presentation: { columns: [{ key: "zone" }] } });
expect<Equal<(typeof place.presentation.columns)[number]["key"], "value" | "label" | "zone">>();
field.many("places", { presentation: { columns: ["label", "zone"] } });
field.pair("people", { presentation: { columns: ["label", "region"] } });
field.nested("people", { presentation: { pick: { key: "region" } } });
field.nested("people", {
  presentation: { optional: { keys: ["credit"] }, pick: { key: "label" } },
});

// @ts-expect-error A column of an object is a key of the option.
field.search("people", { presentation: { columns: [{ key: "zone" }] } });
// @ts-expect-error The option of the endpoint of the field, not of another one.
field.search("places", { presentation: { columns: [{ key: "credit" }] } });
// @ts-expect-error Also in a multiple subtype.
field.many("people", { presentation: { columns: ["typo"] } });
// @ts-expect-error And in a tuple.
field.pair("people", { presentation: { columns: ["label", "zone"] } });
// @ts-expect-error A tuple keeps its length.
field.pair("people", { presentation: { columns: ["label"] } });
// @ts-expect-error In nested and optional members.
field.nested("people", { presentation: { optional: { keys: ["typo"] }, pick: { key: "label" } } });
// @ts-expect-error A required member stays required.
field.search("people", { presentation: {} });
