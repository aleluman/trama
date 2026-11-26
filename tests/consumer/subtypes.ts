// Subtypes from the installed package: declared in modules apart and joined in
// createForms, the factories of its field, the definitions they create, their
// presentation and OptionKey, and the forms and rule sets that admit them.
import {
  createForms,
  createSession,
  defineEndpoints,
  endpoint,
  subtype,
  type AsyncDefinition,
  type CheckboxDefinition,
  type FormValues,
  type MultiSelectDefinition,
  type OptionKey,
  type SelectDefinition,
  type SubtypeDefinition,
  type TextDefinition,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expect = <T extends true>() => undefined as unknown as T;

const catalog = defineEndpoints({
  people: endpoint.options(() =>
    Promise.resolve({
      options: [{ value: 1, label: "Ada", credit: 100, active: true }],
      more: false,
    }),
  ),
  families: endpoint.list(() => Promise.resolve([{ value: 1, label: "Beverages" }])),
});
// Two modules that declare subtypes, joined with shorthand properties.
export const textarea = subtype.text<{ rows?: number }>();
export const search = subtype.async<{ columns: readonly OptionKey[] }>();
export const forms = createForms({
  endpoints: [catalog],
  subtypes: {
    textarea,
    search,
    toggle: subtype.checkbox(),
    combobox: subtype.select(),
    tags: subtype.multiSelect(),
    chips: subtype.multiAsync<{ max?: number }>(),
  },
});
export const { field, defineForm, defineRules } = forms;

// Each factory creates a definition of its base, with its name and its
// presentation, optional when {} satisfies it.
export const notes = field.textarea({ label: "Notes", presentation: { rows: 4 } });
expect<Equal<typeof notes, SubtypeDefinition<TextDefinition, "textarea", { rows?: number }>>>();
expect<
  Equal<ReturnType<typeof field.toggle>, SubtypeDefinition<CheckboxDefinition, "toggle", {}>>
>();
field.textarea();
export const currency = field.combobox({
  options: [
    { value: "JPY", label: "Yen" },
    { value: "USD", label: "Dollar" },
  ],
  default: "JPY",
});
expect<
  Equal<typeof currency, SubtypeDefinition<SelectDefinition<"JPY" | "USD">, "combobox", {}>>
>();
const tags = field.tags({ options: [{ value: "a", label: "A" }] });
expect<Equal<typeof tags, SubtypeDefinition<MultiSelectDefinition<"a">, "tags", {}>>>();
// OptionKey takes the keys of the option of the endpoint of each field.
export const customer = field.search("people", {
  presentation: { columns: ["label", "credit"] },
});
expect<
  Equal<typeof customer.presentation.columns, readonly ("value" | "label" | "credit" | "active")[]>
>();
expect<
  Equal<
    typeof customer,
    SubtypeDefinition<
      AsyncDefinition<{ value: number; label: string; credit: number; active: true }, {}, "people">,
      "search",
      { columns: readonly ("value" | "label" | "credit" | "active")[] }
    >
  >
>();
field.search("families", { presentation: { columns: ["value"] } });
const families = field.chips("families", { presentation: { max: 3 } });
expect<Equal<typeof families.endpoint, "families">>();

// A field of a subtype keeps the value and the rules of its base.
export const invoice = defineForm({
  fields: { notes, customer, currency, tags, families, urgent: field.toggle() },
  collections: { lines: { fields: { done: field.toggle(), note: field.textarea() } } },
  rules: {
    notes: { value: ({ urgent }) => (urgent ? "Urgent" : undefined) },
    customer: {
      disabled: ({ currency: chosen }) => chosen === null,
      placeholder: ({ customer: chosen }) => (chosen === null ? "No customer" : `${chosen.credit}`),
    },
    tags: { value: () => ["a"] },
    lines: { each: { done: { hidden: ({ note }) => note === "" } } },
  },
});
type Values = FormValues<typeof invoice>;
expect<Equal<Values["notes"], string>>();
expect<Equal<Values["urgent"], boolean>>();
expect<Equal<Values["currency"], "JPY" | "USD" | null>>();
expect<Equal<NonNullable<Values["customer"]>["credit"], number>>();
expect<Equal<Values["tags"], readonly "a"[]>>();
expect<Equal<Values["lines"][number]["done"], boolean>>();
const states = createSession(invoice, { scope: 1 }).getSnapshot().fieldStates;
expect<Equal<typeof states.notes.placeholder, string | undefined>>();

// A rule set that requires the base accepts the subtype, and a spread keeps
// the subtype.
const labelled = defineRules({
  fields: { notes: field.text() },
  rules: { notes: { label: () => "Notes" } },
});
defineForm({ fields: { notes: { ...notes, label: "Other" } }, include: [labelled] });
export const subtyped = defineRules({
  fields: { urgent: field.toggle() },
  collections: { lines: { fields: { note: field.textarea() } } },
  rules: { urgent: { hidden: () => true } },
});
defineForm({
  fields: { urgent: field.toggle() },
  collections: { lines: { fields: { note: field.textarea() } } },
  include: [subtyped],
});
// Forms without subtypes, or with an empty object, keep their field.
createForms({ endpoints: [catalog], subtypes: {} }).defineForm({
  fields: { name: field.text() },
});
