import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm,
  endpoint,
  field,
  type RowKey,
} from "trama-forms/core";

const depots = [
  { value: "north", label: "North" },
  { value: "south", label: "South" },
] as const;
const fields = { rate: field.number(), notes: field.text() };
const lines = {
  fields: {
    price: field.number(),
    quantity: field.number(),
    lot: field.text(),
    warehouse: field.select({ options: depots }),
    notes: field.text(),
  },
};
const collections = { lines, payments: { fields: { amount: field.number() } } };

defineForm({
  fields,
  collections,
  // @ts-expect-error The fields of each are fields of the rows.
  rules: { lines: { each: { amout: { value: () => 1 } } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error A collection takes only each.
  rules: { lines: { value: () => [] } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error A patch of a row writes fields of its row.
  rules: { lines: { each: { price: { onChange: () => ({ pricee: 1 }) } } } },
});
const withTypo = () => ({ quantity: 1, lott: "" });
defineForm({
  fields,
  collections,
  // @ts-expect-error A helper cannot hide a field of another row.
  rules: { lines: { each: { price: { onChange: withTypo } } } },
});
defineForm({
  fields,
  collections,
  rules: {
    notes: {
      // @ts-expect-error A patch of the header writes the fields of the rows of each collection.
      onChange: (_, { rows }) => ({
        lines: Object.fromEntries(rows.lines.map((key) => [key, { warehous: "north" }])),
      }),
    },
  },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error A select of a row has no placeholder.
  rules: { lines: { each: { warehouse: { placeholder: () => "Choose" } } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error The defineForm of trama-forms/core takes no query, also in rows.
  rules: { lines: { each: { price: { query: { endpoint: "price" } } } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error A states patch of a row sets fields of its row.
  rules: { lines: { each: { price: { states: () => ({ rate: { hidden: true } }) } } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error toDefaults of a row names fields of its row.
  rules: { lines: { each: { price: { onChange: (_, { toDefaults }) => toDefaults("rate") } } } },
});
defineForm({
  fields,
  // @ts-expect-error A collection cannot take the name of a field.
  collections: { notes: { fields: { text: field.text() } } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error Exceptions name fields of the rows of a collection.
  form: { readOnly: { value: () => true, except: [{ lines: ["nots"] }] } },
});
defineForm({
  fields,
  collections,
  // @ts-expect-error Exceptions name collections of the form.
  form: { readOnly: { value: () => true, except: [{ line: ["notes"] }] } },
});
const sales = defineEndpoints({
  customers: endpoint.options(() =>
    Promise.resolve({ options: [{ value: 1, label: "One" }], more: false }),
  ),
});
const bound = createForms({ endpoints: [sales] });
defineForm({
  fields: { note: field.text() },
  // @ts-expect-error The defineForm of the core takes no async field in rows.
  collections: { lines: { fields: { customer: bound.field.async("customers") } } },
});

const maybe = (optional: typeof collections | undefined) =>
  // @ts-expect-error A section of collections that may be undefined declares none.
  defineForm({ fields, collections: optional });
void maybe;

const form = defineForm({ fields, collections });
const session = createSession(form);
const [line] = session.add("lines", [{}]);
const [payment] = session.add("payments", [{}]);
// @ts-expect-error A collection is not edited as a field.
session.edit("lines", []);
// @ts-expect-error A key of another collection does not name a row of this one.
session.row("lines", payment);
// @ts-expect-error A key of another collection is not removed from this one.
session.remove("lines", [payment]);
// @ts-expect-error A key is not a string.
session.move("lines", "r1", 0);
// @ts-expect-error A row added names fields of its collection.
session.add("lines", [{ quantiti: 1 }]);
// @ts-expect-error A misspelled field next to a right one is named too.
session.add("lines", [{ quantity: 1, quantiti: 2 }]);
const copied = () => ({ quantity: 1, quantiti: 2 });
// @ts-expect-error Also in a row that a function returns.
session.add("lines", [copied()]);
// @ts-expect-error A patch names fields of the header.
session.patch({ note: "" });
// @ts-expect-error A patch names fields of the rows of each collection.
session.patch({ lines: { [line]: { pric: 1 } } });
session.patch({
  // @ts-expect-error Also inside Object.fromEntries.
  lines: Object.fromEntries(session.getSnapshot().rows.lines.map((key) => [key, { lott: "" }])),
});
// @ts-expect-error The handle edits fields of its row.
session.row("lines", line).edit("pric", 1);
// @ts-expect-error A value of the field type.
session.row("lines", line).edit("price", "1");
void (line satisfies RowKey<"lines">);
defineForm({
  fields,
  collections,
  rules: {
    rate: {
      // @ts-expect-error A misspelled field next to a right one is named too.
      onChange: (_, { rows }) => ({
        lines: Object.fromEntries(rows.lines.map((key) => [key, { lot: "", warehous: "north" }])),
      }),
    },
  },
});
// @ts-expect-error A misspelled field next to a right one is named too.
session.patch({
  lines: Object.fromEntries(
    session.getSnapshot().rows.lines.map((key) => [key, { lot: "", lott: "" }]),
  ),
});
