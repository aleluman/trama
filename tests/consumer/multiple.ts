// Dates and multiple values from the installed package: their values, arrays
// written without as const in every place a rule writes, remote multiple
// fields with params, lists by name and list queries, and their definitions.
// Positives compile without casts.
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm as defineCoreForm,
  endpoint,
  field as coreField,
  type DateDefinition,
  type FormValues,
  type MultiAsyncDefinition,
  type MultiSelectDefinition,
  type Option,
  type OptionList,
  type RowValues,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expect = <T extends true>() => undefined as unknown as T;

type Family = Option<{ code: string }, number>;
const catalog = defineEndpoints({
  families: endpoint.list((): Promise<Family[]> => Promise.resolve([])),
  subfamilies: endpoint.list(
    (_, { families }: { families: readonly number[] }): Promise<Option[]> =>
      Promise.resolve(families.map((value) => ({ value, label: "" }))),
  ),
});
const { defineForm, defineRules, field } = createForms({ endpoints: [catalog] });

const kinds = field.multiSelect({
  options: [
    { value: "sale", label: "Sale" },
    { value: "quote", label: "Quote" },
  ],
});
const codes = field.multiSelect({
  options: [
    { value: 1, label: "One" },
    { value: 2, label: "Two" },
  ],
});
expect<Equal<typeof kinds, MultiSelectDefinition<"sale" | "quote">>>();
expect<Equal<ReturnType<typeof field.date>, DateDefinition>>();
const fields = { trigger: field.text(), kinds, codes, from: field.date() };

// A report of the guide: dates, a static multiple and the families with their
// dependent subfamilies.
export const report = defineForm({
  fields: {
    ...fields,
    to: field.date({ placeholder: "YYYY-MM-DD" }),
    families: field.multiAsync("families"),
    subfamilies: field.multiAsync("subfamilies", { placeholder: "All" }),
  },
  rules: {
    kinds: { value: () => ["sale"] },
    codes: { value: ({ trigger }) => (trigger === "" ? [1] : [1, 2]) },
    to: { placeholder: ({ from }) => (from === null ? "Start date first" : undefined) },
    families: {
      onChange: ({ families }) => (families.length === 0 ? { subfamilies: [] } : undefined),
    },
    subfamilies: {
      params: ({ families }) =>
        families.length === 0 ? undefined : { families: families.map((family) => family.value) },
      disabled: ({ families }) => families.length === 0,
    },
  },
});
type ReportValues = FormValues<typeof report>;
expect<Equal<ReportValues["kinds"], readonly ("sale" | "quote")[]>>();
expect<Equal<ReportValues["codes"], readonly (1 | 2)[]>>();
expect<Equal<ReportValues["from"], string | null>>();
expect<Equal<ReportValues["families"][number]["code"], string>>();
const families: MultiAsyncDefinition<Family> = report.fields.families;
expect<Equal<typeof families.endpoint, string>>();
expect<Equal<typeof report.fields.families.endpoint, "families">>();

// Lists by name take the remote multiple fields, in the header and in rows.
const session = createSession(report, { scope: "acme" });
export const familyList: OptionList<Family> = session.list("families");
export const childList = session.list("subfamilies");
// @ts-expect-error A static multiple field has no list.
session.list("kinds");

// Arrays without as const in events, patches of rows, toDefaults and sets.
export const rows = defineForm({
  fields: { trigger: field.text() },
  collections: { lines: { fields: { ...fields, families: field.multiAsync("families") } } },
  rules: {
    trigger: {
      onChange: (_, { rows: keys, toDefaults }) => {
        const reset = toDefaults("trigger");
        expect<Equal<typeof reset.trigger, string>>();
        const [first] = keys.lines;
        return first === undefined ? undefined : { lines: { [first]: { kinds: ["quote"] } } };
      },
    },
    lines: {
      each: {
        kinds: { value: () => ["sale"] },
        trigger: {
          onChange: (_, { toDefaults }) => {
            const reset = toDefaults("kinds");
            expect<Equal<typeof reset.kinds, readonly ("sale" | "quote")[]>>();
            return { codes: [2] };
          },
        },
      },
    },
  },
});
type Line = RowValues<(typeof rows.collections.lines)["fields"]>;
expect<Equal<Line["kinds"], readonly ("sale" | "quote")[]>>();
expect<Equal<Line["families"], readonly Family[]>>();
const opened = createSession(rows, { scope: "acme", initial: { lines: [{}] } });
const [key] = opened.getSnapshot().rows.lines;
export const rowList = key === undefined ? undefined : opened.row("lines", key).list("families");
export const shared = defineRules({
  fields,
  collections: { lines: { fields } },
  rules: {
    trigger: { onChange: () => ({ kinds: ["quote"] }) },
    kinds: { value: () => ["sale"] },
    lines: { each: { kinds: { value: () => ["sale"] } } },
  },
});
export const included = defineForm({
  fields,
  collections: { lines: { fields } },
  include: [shared],
});

// A list query writes the whole list into a remote multiple field.
export const listed = defineForm({
  fields: { all: field.checkbox(), families: field.multiAsync("families") },
  rules: {
    families: { query: { endpoint: "families", params: ({ all }) => (all ? {} : undefined) } },
  },
});

// The core defines dates and static multiples without a registry.
export const core = defineCoreForm({
  fields: {
    from: coreField.date(),
    kinds: coreField.multiSelect({ options: [{ value: 1, label: "One" }], default: [1] }),
  },
});
expect<Equal<FormValues<typeof core>["kinds"], readonly 1[]>>();
