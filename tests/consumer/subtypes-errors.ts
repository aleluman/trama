// What subtypes reject in types. Each negative fails for the reason its
// directive gives.
import {
  createForms,
  defineEndpoints,
  defineForm as defineCoreForm,
  defineRules as defineCoreRules,
  endpoint,
  subtype,
  type OptionKey,
} from "trama-forms/core";

const catalog = defineEndpoints({
  people: endpoint.options(() =>
    Promise.resolve({
      options: [{ value: 1, label: "Ada", credit: 100 }],
      more: false,
    }),
  ),
});
const forms = createForms({
  endpoints: [catalog],
  subtypes: {
    textarea: subtype.text<{ rows?: number }>(),
    search: subtype.async<{ columns: readonly OptionKey[] }>(),
    combobox: subtype.select(),
  },
});
const { field, defineForm, defineRules } = forms;
// Other forms with a subtype of the same name and another presentation.
const other = createForms({
  endpoints: [],
  subtypes: { textarea: subtype.text<{ mask: string }>() },
});
const masked = other.field.textarea({ presentation: { mask: "999" } });

createForms({
  endpoints: [],
  // @ts-expect-error A subtype is declared once.
  subtypes: { notes: subtype.text(), notes: subtype.text() }, // oxlint-disable-line no-dupe-keys
});
// @ts-expect-error A subtype cannot take the name of a field type.
createForms({ endpoints: [], subtypes: { date: subtype.text() } });
// @ts-expect-error A presentation is plain data.
subtype.text<{ render: () => string }>();
// @ts-expect-error A column is a key of the option of the endpoint.
field.search("people", { presentation: { columns: ["label", "region"] } });
// @ts-expect-error The presentation is required when {} does not satisfy it.
field.search("people");
// @ts-expect-error The endpoint is a key of the forms.
field.search("ghost", { presentation: { columns: [] } });
// @ts-expect-error A presentation of its type.
field.textarea({ presentation: { rows: "4" } });
// @ts-expect-error Without other keys.
field.textarea({ presentation: { rows: 4, cols: 80 } });
// @ts-expect-error The default of a select subtype is one of its options.
field.combobox({ options: [{ value: "JPY", label: "Yen" }], default: "USD" });
// @ts-expect-error The field has a factory per declared subtype only.
void field.textareas;
// @ts-expect-error A field of other forms does not enter.
defineForm({ fields: { notes: masked } });
// @ts-expect-error Nor in a row.
defineForm({ fields: {}, collections: { lines: { fields: { notes: masked } } } });
// @ts-expect-error Nor in a rule set.
defineRules({ fields: { notes: masked }, rules: {} });
// @ts-expect-error Forms without subtypes do not take one either.
createForms({ endpoints: [] }).defineForm({ fields: { notes: masked } });
// @ts-expect-error The defineForm of the core takes no subtypes.
defineCoreForm({ fields: { notes: field.textarea() } });
// @ts-expect-error Nor its defineRules.
defineCoreRules({ fields: { notes: field.textarea() }, rules: {} });
// @ts-expect-error A rule takes the value of the base.
defineForm({ fields: { notes: field.textarea() }, rules: { notes: { value: () => 4 } } });
// In each member of a union of sections, whose keyof keeps only shared keys.
declare const section: { notes: ReturnType<typeof field.text> } | { masked: typeof masked };
// @ts-expect-error A member with a field of other forms does not enter.
defineForm({ fields: section });
// @ts-expect-error Nor in the core.
defineCoreForm({ fields: section });
declare const rows: { a: ReturnType<typeof field.text> } | { b: typeof masked };
// @ts-expect-error Nor in a row.
defineForm({ fields: {}, collections: { lines: { fields: rows } } });
// A union of sections with fields of these forms enters.
declare const own:
  | { notes: ReturnType<typeof field.textarea> }
  | { name: ReturnType<typeof field.text> };
defineForm({ fields: own });
