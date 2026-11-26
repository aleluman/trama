import { defineForm, field } from "trama-forms/core";

const shape = {
  confirmed: field.checkbox(),
  customer: field.text(),
  note: field.text(),
};

// One entry or an array, with or without exceptions, a reason, peek, and the
// sections in any order. Duplicated and reused exceptions are accepted.
const except = ["confirmed", "note"] as const;
const lock = { value: ({ confirmed }: { readonly confirmed: boolean }) => confirmed };
defineForm({
  form: {
    readOnly: { value: ({ confirmed }) => confirmed && "Order confirmed", except: ["confirmed"] },
  },
  fields: shape,
});
defineForm({
  fields: shape,
  rules: { note: { disabled: ({ confirmed }) => confirmed } },
  form: {
    readOnly: [
      { value: (_, { peek }) => peek.confirmed, except: ["confirmed", "confirmed"] },
      { value: ({ customer }) => (customer === "" ? undefined : true), except },
      lock,
    ],
  },
});
defineForm({ fields: shape, form: {} });
defineForm({ fields: shape, form: { readOnly: [] } });

// The section, its entries and their exceptions are closed.
defineForm({
  fields: shape,
  // @ts-expect-error form only takes readOnly in this version.
  form: { hidden: [{ value: () => true }] },
});
defineForm({
  fields: shape,
  // @ts-expect-error form is an object, not a function.
  form: () => ({ readOnly: [] }),
});
const hiddenSection = { readOnly: [], disabled: [] };
defineForm({
  fields: shape,
  // @ts-expect-error A reused section cannot hide another property.
  form: hiddenSection,
});
defineForm({
  fields: shape,
  // @ts-expect-error Exceptions name fields of the definition.
  form: { readOnly: { value: () => true, except: ["confirmd"] } },
});
const names = ["confirmed", "notes"];
defineForm({
  fields: shape,
  // @ts-expect-error Reused exceptions keep their names.
  form: { readOnly: [{ value: () => true, except: names }] },
});
const misspelled = { value: () => true, exept: ["confirmed"] };
defineForm({
  fields: shape,
  // @ts-expect-error A reused entry cannot hide a misspelled property.
  form: { readOnly: [misspelled] },
});
defineForm({
  fields: shape,
  // @ts-expect-error An entry needs its formula.
  form: { readOnly: [{ except: ["confirmed"] }] },
});

// The value of the lock has the domain of readOnly.
defineForm({
  fields: shape,
  // @ts-expect-error A reason cannot be empty.
  form: { readOnly: { value: () => "" } },
});
const empty = { value: () => "" as const };
defineForm({
  fields: shape,
  // @ts-expect-error A reused entry keeps its empty reason.
  form: { readOnly: [empty] },
});
defineForm({
  fields: shape,
  // @ts-expect-error A number is not a contribution.
  form: { readOnly: { value: () => 1 } },
});
defineForm({
  fields: shape,
  // @ts-expect-error The lock is synchronous.
  form: { readOnly: { value: () => Promise.resolve(true) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error value is a formula, not a flag.
  form: { readOnly: { value: true } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Reads name fields of the definition.
  form: { readOnly: { value: ({ confirmd }) => confirmd === true } },
});
defineForm({
  fields: shape,
  // @ts-expect-error A numeric key is not a property of an entry.
  form: { readOnly: { value: () => true, 1: [] } },
});
