// What dates and multiple values reject in types. Each negative fails for the
// reason its directive gives.
import {
  createForms,
  defineEndpoints,
  defineForm as defineCoreForm,
  endpoint,
  type Option,
} from "trama-forms/core";

const catalog = defineEndpoints({
  families: endpoint.list((): Promise<Option[]> => Promise.resolve([])),
  price: endpoint.value(() => Promise.resolve(1)),
});
const { defineForm, defineRules, field } = createForms({ endpoints: [catalog] });
const kinds = field.multiSelect({ options: [{ value: "sale", label: "Sale" }] });
const codes = field.multiSelect({ options: [{ value: 1, label: "One" }] });
const fields = { trigger: field.text(), kinds, codes };

// @ts-expect-error A value that is not an option.
defineForm({ fields, rules: { kinds: { value: () => ["wrong"] } } });
// @ts-expect-error The empty text is not an option either.
defineForm({ fields, rules: { kinds: { value: () => [""] } } });
// @ts-expect-error Nor is a zero that no option has.
defineForm({ fields, rules: { codes: { value: () => [0] } } });
// @ts-expect-error An event writes options too.
defineForm({ fields, rules: { trigger: { onChange: () => ({ kinds: ["wrong"] }) } } });
defineForm({
  fields,
  collections: { lines: { fields } },
  // @ts-expect-error A formula of a row too.
  rules: { lines: { each: { kinds: { value: () => ["wrong"] } } } },
});
// @ts-expect-error A rule set too.
defineRules({ fields, rules: { kinds: { value: () => ["wrong"] } } });
const widened: string[] = ["sale"];
// @ts-expect-error An array already widened to string does not fit.
defineForm({ fields, rules: { kinds: { value: () => widened } } });
// @ts-expect-error The default takes values of the options.
field.multiSelect({ options: [{ value: "sale", label: "Sale" }], default: ["wrong"] });
// @ts-expect-error A static multiple field has no placeholder.
field.multiSelect({ options: [], placeholder: "All" });
// @ts-expect-error A date default is a text, not a Date.
field.date({ default: new Date() });
// @ts-expect-error A remote multiple field takes a list endpoint, not a value one.
field.multiAsync("price");
// @ts-expect-error Its default is an array of options, not one option.
field.multiAsync("families", { default: { value: 1, label: "One" } });
// @ts-expect-error A static multiple field has no params.
defineForm({ fields, rules: { kinds: { params: () => ({}) } } });
// @ts-expect-error The defineForm of the core rejects remote multiple fields.
defineCoreForm({ fields: { families: field.multiAsync("families") } });
