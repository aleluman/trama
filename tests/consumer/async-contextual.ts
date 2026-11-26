// Formulas of state beside required params, from the installed package: each
// flag of an entry whose params are required types its formula from the
// context, alone or in an array, before or after its params.
import { declareContext, type DeepReadonly } from "trama-forms/core";
import { defineForm, field, type Contact, type Customer } from "./async.js";
import { contactParams } from "./async-forms.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const fields = {
  customer: field.async("customers", { label: "Customer" }),
  contact: field.async("contacts", { label: "Contact" }),
  note: field.text(),
};
// contacts requires { customer }: every flag of contact reads the values with
// their types, and the option of the customer with its data.
defineForm({
  fields,
  rules: {
    contact: {
      params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
      hidden: ({ customer, contact }) => {
        void (true satisfies Equal<typeof customer, DeepReadonly<Customer> | null>);
        void (true satisfies Equal<typeof contact, DeepReadonly<Contact> | null>);
        return customer?.deliveryHint === "";
      },
      disabled: ({ note }, { peek }) => peek.customer === null && note === "" && "No customer",
      readOnly: [({ customer }) => customer === null, ({ note }) => note.length > 9 && "Long"],
      required: [({ note }) => note !== ""],
    },
  },
});
// A flag before params that read the values, and before params that read
// nothing; disabled as an array.
defineForm({
  fields,
  rules: {
    contact: {
      required: ({ customer }) => customer?.defaultContact !== null,
      disabled: [({ note }) => note === "" && "No note", ({ customer }) => customer === null],
      params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
    },
  },
});
defineForm({
  fields,
  rules: { contact: { hidden: ({ note }) => note === "", params: () => ({ customer: 1 }) } },
});
// The context reaches the flags of the entry too.
defineForm({
  context: declareContext<{ mode: "create" | "edit" }>(),
  fields,
  rules: {
    contact: {
      ...contactParams,
      disabled: (_, { context }) => context.mode === "edit" && "Editing",
    },
  },
});
// Controls: a field without required params, and the label and the event of
// the same entry, typed before as now.
defineForm({
  fields,
  rules: {
    customer: { hidden: ({ note }) => note === "" },
    contact: {
      ...contactParams,
      label: ({ customer }) => customer?.label,
      onChange: ({ contact }) => ({ note: contact?.email ?? "" }),
    },
  },
});
// The flags still check what they read and what they return.
defineForm({
  fields,
  rules: {
    contact: {
      ...contactParams,
      // @ts-expect-error The form has no field "missing".
      hidden: ({ missing }) => missing === 1,
    },
  },
});
defineForm({
  fields,
  rules: {
    contact: {
      ...contactParams,
      // @ts-expect-error A flag returns a boolean, a reason or undefined.
      readOnly: [({ note }) => note.length],
    },
  },
});
// Wrong params report only their own error: the placeholder beside them is
// not taken as referencing itself.
defineForm({
  fields,
  rules: {
    contact: {
      // @ts-expect-error contacts requires { customer }.
      params: () => ({}),
      placeholder: () => "Choose a contact",
    },
  },
});
