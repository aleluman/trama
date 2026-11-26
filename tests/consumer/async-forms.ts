// Remote selection from the installed package: params through rules and the
// entry, whole options in formulas and patches, and sessions with scope.
import {
  createForms,
  createSession,
  defineForm as coreDefineForm,
  type DeepReadonly,
  type LoadKey,
  type Loader,
  type OptionList,
  type OptionListSnapshot,
  type Scope,
} from "trama-forms/core";
import { defineForm, field, inline, order, type Contact, type Customer } from "./async.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const enabled = Math.random() < 2;

// ------------------------------------------------------------ defineForm
const fields = {
  customer: field.async("customers", { label: "Customer" }),
  contact: field.async("contacts", { label: "Contact" }),
  note: field.text(),
};
export const contactParams = {
  params: ({ customer }: { readonly customer: DeepReadonly<Customer> | null }) =>
    customer === null ? undefined : { customer: customer.value },
};
const contactRules = () => ({ contact: contactParams });
// Sections in any order; metadata read in formulas, events and outputs; a value
// formula and a patch write whole options.
const reversed = defineForm({
  outputs: ({ output }) => ({ hint: output(({ customer }) => customer?.deliveryHint ?? "") }),
  rules: {
    note: {
      value: ({ customer }) => customer?.deliveryHint ?? "",
      hidden: ({ customer }) => customer?.defaultContact === null,
      states: ({ customer }) => ({ contact: { placeholder: customer?.label } }),
    },
    contact: { ...contactParams, value: ({ customer }) => customer?.defaultContact ?? null },
    customer: {
      params: () => ({}),
      onChange: ({ customer }, { toDefaults }) =>
        customer === null ? toDefaults("contact") : { contact: customer.defaultContact },
    },
  },
  form: { readOnly: { value: ({ customer }) => customer === null, except: ["customer"] } },
  fields,
});
createSession(reversed, { scope: 1 }).watchOutputs(({ hint }) => void (hint satisfies string));
// A reused entry with params, and explicit type arguments.
defineForm({ fields, rules: { contact: contactParams } });
defineForm<typeof fields>({ fields, rules: { contact: contactParams } });
// Without required params, rules and params are optional and take undefined.
const optionalFields = { customer: fields.customer, note: fields.note };
defineForm({ fields: optionalFields });
defineForm({ fields: optionalFields, rules: undefined });
defineForm({ fields: optionalFields, rules: { customer: { params: undefined } } });
// A params formula may suspend with undefined, also reading another field.
defineForm({
  fields,
  rules: {
    contact: { params: ({ note }) => (note === "" ? undefined : { customer: note.length }) },
  },
});
// Params with optional keys only are optional.
const search = createForms({ endpoints: [inline] });
search.defineForm({ fields: { filtered: search.field.async("filtered") } });
// @ts-expect-error params is required when the endpoint requires params.
defineForm({ fields, rules: { contact: {} } });
// @ts-expect-error So is the entry of the field.
defineForm({ fields, rules: { note: {} } });
// @ts-expect-error And rules.
defineForm({ fields });
// @ts-expect-error params cannot be undefined then.
defineForm({ fields, rules: { contact: { params: undefined } } });
defineForm({
  fields,
  // @ts-expect-error The result of params must fit the params of the endpoint.
  rules: { contact: { params: ({ customer }) => ({ customer: customer?.label ?? "" }) } },
});
defineForm({
  fields,
  // @ts-expect-error null does not suspend; only undefined does.
  rules: { contact: { params: () => null } },
});
defineForm({
  fields,
  // @ts-expect-error A field that is not async has no params.
  rules: { ...contactRules(), note: { params: () => ({}) } },
});
defineForm({
  fields,
  // @ts-expect-error A value formula returns the whole option, not its value.
  rules: { ...contactRules(), customer: { value: ({ contact }) => contact?.value ?? null } },
});
defineForm({
  fields,
  // @ts-expect-error A patch writes the whole option, not its value.
  rules: { ...contactRules(), customer: { onChange: () => ({ contact: 7 }) } },
});
defineForm({
  fields,
  rules: {
    ...contactRules(),
    customer: {
      onChange: ({ customer }) => {
        // @ts-expect-error Values are read-only in depth.
        if (customer !== null) customer.defaultContact = null;
        return {};
      },
    },
  },
});
defineForm({
  fields,
  // @ts-expect-error A conditional entry cannot hold required params.
  rules: { ...(enabled && { contact: contactParams }) },
});
const wrongParams = { params: () => ({ customer: "1" }) };
defineForm({
  fields,
  // @ts-expect-error A reused entry with params of another type.
  rules: { contact: wrongParams },
});
// The async fields of another registry, and the defineForm of trama-forms/core.
const other = createForms({ endpoints: [inline] });
// @ts-expect-error The async fields of another registry are rejected.
defineForm({ fields: { code: other.field.async("codes") } });
// @ts-expect-error The defineForm of trama-forms/core rejects async fields.
coreDefineForm({ fields: { customer: field.async("customers") } });

// -------------------------------------------------------------- sessions
declare const saved: { customer: Customer; contact: Contact };
const session = createSession(order, {
  scope: "acme",
  initial: { customer: saved.customer, contact: saved.customer.defaultContact },
});
createSession(order, { scope: 7, initial: undefined, loader: undefined });
// A loader receives the key that Trama builds, run, and the caller's signal.
const loader: Loader = (key, run, { signal }) => {
  const [prefix, scope, endpointKey, params] = key;
  void [prefix satisfies "trama", scope satisfies Scope, endpointKey satisfies string];
  void (params satisfies object);
  return run(signal);
};
createSession(order, { scope: "acme", loader });
const keys: LoadKey[] = [
  ["trama", "acme", "customers", {}, "", 1],
  ["trama", 7, "contacts", { customer: 1 }],
];
void keys;
session.edit("customer", saved.customer);
session.edit("customer", null);
// A view of an async field lists the options of its endpoint.
const list = session.list("customer");
const listed: Equal<typeof list, OptionList<Customer>> = true;
void listed;
const snapshot: OptionListSnapshot<Customer> = list.getSnapshot();
void (snapshot.options[0]?.deliveryHint satisfies string | undefined);
void (snapshot.status satisfies "idle" | "suspended" | "loading" | "ready" | "error");
void [snapshot.text satisfies string, snapshot.complete, snapshot.error?.message];
list.search("acme");
list.open();
list.more();
list.retry();
list.subscribe(() => list.getSnapshot())();
session.list("contact").getSnapshot().options[0]?.email satisfies string | undefined;
// A form without async fields needs no scope.
const plainForm = defineForm({ fields: { note: field.text() } });
createSession(plainForm);
createSession(plainForm, { scope: undefined, loader: undefined });
// @ts-expect-error A form with async fields requires a scope.
createSession(order);
// @ts-expect-error Also with other options.
createSession(order, { initial: { customer: null } });
// @ts-expect-error scope cannot be undefined then.
createSession(order, { scope: undefined });
// @ts-expect-error A scope is a string or a number.
createSession(order, { scope: { company: 1 } });
// @ts-expect-error initial takes the whole option, not its value.
createSession(order, { scope: "acme", initial: { customer: 1 } });
// @ts-expect-error edit takes the whole option too.
session.edit("customer", 1);
// @ts-expect-error Only async fields have an option list.
session.list("note");
// @ts-expect-error A form without async fields has no option lists.
createSession(plainForm).list("note");
// @ts-expect-error The snapshot publishes text; search is an action of the list.
void snapshot.search;
const [first] = snapshot.options;
// @ts-expect-error The options of a list are read-only.
if (first) first.label = "x";
// @ts-expect-error A loader returns what run returns.
createSession(order, { scope: "acme", loader: () => Promise.resolve(1) });

// ---------------------------------------------------------------- unions
// A field whose definition is either endpoint requires what either one needs.
const either = enabled ? field.async("contacts") : field.async("customers");
// @ts-expect-error params is required when a member of the field's definition requires it.
defineForm({ fields: { either } });
defineForm({ fields: { either }, rules: { either: { params: () => ({ customer: 1 }) } } });
// A union of definitions requires the scope when any of them has async fields.
const picked = defineForm({ fields: { picked: field.async("customers") } });
const either2 = enabled ? picked : plainForm;
// @ts-expect-error scope is required when a member of the union has async fields.
createSession(either2);
createSession(either2, { scope: "acme" });
