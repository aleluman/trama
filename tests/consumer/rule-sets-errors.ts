// What include rejects in types, on the element of include: the requirements
// of a set, its registry, and the properties a form takes once per field.
import {
  declareContext,
  defineForm as coreForm,
  defineRules as coreRules,
  field as coreField,
} from "trama-forms/core";
import { lotParams } from "./rows-queries.js";
import {
  amounts,
  defineForm,
  defineRules,
  discountedAmounts,
  enabled,
  field,
  lots,
  sale,
  sentLock,
  totals,
} from "./rule-sets.js";

// Requirements: a missing field, collection or field of a row, and another
// type of value, domain of a select, option or endpoint of an async field.
const rate = coreRules({ fields: { rate: coreField.number() }, rules: {} });
// @ts-expect-error rule set requires field "rate"
coreForm({ fields: { notes: coreField.text() }, include: [rate] });
// @ts-expect-error rule set requires field "rate" of another type
coreForm({ fields: { rate: coreField.text() }, include: [rate] });
const kind = coreRules({
  fields: { kind: coreField.select({ options: [{ value: "a", label: "A" }] }) },
  rules: {},
});
coreForm({
  // @ts-expect-error rule set requires field "kind" of another type
  include: [kind],
  fields: { kind: coreField.select({ options: [{ value: 1, label: "One" }] }) },
});
// A label, a default or a placeholder of its own are the form's.
coreForm({
  fields: { kind: coreField.select({ label: "Type", options: [{ value: "a", label: "Other" }] }) },
  include: [kind],
});
coreForm({ fields: { rate: coreField.number({ default: 2, label: "Rate" }) }, include: [rate] });
// Definitions written as objects keep their label and default in their type;
// they still are the form's.
coreForm({
  fields: { rate: { type: "number", default: 1, label: "Rate" } },
  include: [
    coreRules({ fields: { rate: { type: "number", default: 5, label: "Other" } }, rules: {} }),
  ],
});
// The option of an async field and its endpoint.
const products = defineRules({ fields: { item: field.async("products") }, rules: {} });
// @ts-expect-error rule set requires field "item" of another type
defineForm({ fields: { item: field.async("lots") }, include: [products] });
const rows = coreRules({
  collections: { lines: { fields: { amount: coreField.number() } } },
  rules: {},
});
// @ts-expect-error rule set requires collection "lines"
coreForm({ fields: {}, include: [rows] });
// @ts-expect-error rule set requires field "amount" of "lines"
coreForm({ fields: {}, collections: { lines: { fields: {} } }, include: [rows] });
coreForm({
  fields: {},
  collections: { lines: { fields: { amount: coreField.text() } } },
  // @ts-expect-error rule set requires field "amount" of "lines" of another type
  include: [rows],
});
// The context: a set with one requires one that fits; a wider one does.
defineForm({
  ...sale,
  // @ts-expect-error rule set requires another context
  include: [lots, sentLock],
});
defineForm({
  ...sale,
  context: declareContext<{ sent: boolean; user: string }>(),
  include: [lots, sentLock],
});
defineForm({
  ...sale,
  context: declareContext<{ sent: string }>(),
  // @ts-expect-error rule set requires another context
  include: [lots, sentLock],
});
// A set of createForms in the defineForm of the core.
const bound = defineRules({ fields: { notes: field.text() }, rules: {} });
coreForm({
  fields: { notes: coreField.text() },
  // @ts-expect-error rule set of createForms: define the form with the defineForm of createForms
  include: [bound],
});

// value, onChange, params and query, once per field in the whole form.
defineForm({
  ...sale,
  // @ts-expect-error field "amount" of "lines" value is declared by another rule set
  include: [lots, amounts, discountedAmounts],
});
defineForm({
  ...sale,
  // @ts-expect-error field "lot" of "lines" params is declared in rules too
  include: [lots],
  rules: { lines: { each: { lot: { params: lotParams } } } },
});
const totalEvent = defineRules({ ...sale, rules: { total: { onChange: () => ({}) } } });
defineForm({
  ...sale,
  // @ts-expect-error field "total" onChange or onEdit is declared by another rule set
  include: [lots, totalEvent, enabled && totalEvent],
});
const rateQuery = defineRules({
  ...sale,
  rules: { total: { query: { endpoint: "linePrice", params: () => ({ product: "", list: "" }) } } },
});
defineForm({
  ...sale,
  // @ts-expect-error field "total" query is declared in rules too
  include: [lots, rateQuery],
  rules: { total: { query: { endpoint: "linePrice", params: () => ({ product: "", list: "" }) } } },
});
// The state properties accumulate.
const hiddenNotes = defineRules({
  ...sale,
  rules: { notes: { hidden: () => true, label: () => "" } },
});
defineForm({
  ...sale,
  include: [lots, hiddenNotes, sentLock],
  context: declareContext<{ sent: boolean }>(),
  rules: { notes: { hidden: () => false, disabled: () => "Online" } },
});
// A property that is only undefined declares nothing; an optional function
// does.
const nothing = defineRules({ ...sale, rules: { total: { value: undefined } } });
defineForm({ ...sale, include: [lots, nothing, totals] });
declare const maybe: (() => number) | undefined;
const maybeTotal = defineRules({ ...sale, rules: { total: { value: maybe } } });
// @ts-expect-error field "total" value is declared by another rule set
defineForm({ ...sale, include: [lots, maybeTotal, totals] });
// The alternatives of one element do not meet.
defineForm({ ...sale, include: [lots, enabled ? amounts : discountedAmounts, totals] });
// A field of the header named as a field of a row is another field.
const odd = coreField.number();
const header = { ...sale.fields, 'amount" of "lines': odd };
const oddValue = defineRules({
  fields: header,
  collections: sale.collections,
  rules: { 'amount" of "lines': { value: () => 1 } },
});
defineForm({ fields: header, collections: sale.collections, include: [lots, oddValue, amounts] });

// A field or collection named by a number, as [-1], is the name "-1" at
// runtime: its requirements and its single properties are checked as any
// other, also when the set and the form write the name in different ways.
const numbered = { [-1]: coreField.number() };
const numberedValue = coreRules({ fields: numbered, rules: { [-1]: { value: () => 1 } } });
// @ts-expect-error rule set requires field "-1"
coreForm({ fields: { notes: coreField.text() }, include: [numberedValue] });
// @ts-expect-error rule set requires field "-1" of another type
coreForm({ fields: { [-1]: coreField.text() }, include: [numberedValue] });
coreForm({ fields: { "-1": coreField.number() }, include: [numberedValue] });
coreForm({
  fields: numbered,
  // @ts-expect-error field "-1" value is declared by another rule set
  include: [numberedValue, coreRules({ fields: numbered, rules: { [-1]: { value: () => 2 } } })],
});
coreForm({
  fields: numbered,
  // @ts-expect-error field "-1" value is declared in rules too
  include: [numberedValue],
  rules: { [-1]: { value: () => 2 } },
});
const numberedRows = { lines: { fields: { [-1]: coreField.number() } } };
const rowValue = coreRules({
  collections: numberedRows,
  rules: { lines: { each: { [-1]: { value: () => 1 } } } },
});
// @ts-expect-error rule set requires field "-1" of "lines"
coreForm({ fields: {}, collections: { lines: { fields: {} } }, include: [rowValue] });
const otherRowValue = coreRules({
  collections: numberedRows,
  rules: { lines: { each: { [-1]: { value: () => 2 } } } },
});
coreForm({
  fields: {},
  collections: numberedRows,
  // @ts-expect-error field "-1" of "lines" value is declared by another rule set
  include: [rowValue, otherRowValue],
});
