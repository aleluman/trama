// Remote selection from the installed package: endpoints, createForms, params,
// options as values, sessions with scope and option lists. Positives compile
// without casts; each negative fails for the reason its directive gives.
import {
  createForms,
  defineEndpoints,
  endpoint,
  type AsyncDefinition,
  type BoundDefineForm,
  type BoundField,
  type DeepReadonly,
  type Endpoint,
  type FormValues,
  type Merged,
  type Option,
  type Registry,
  type Scope,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
const enabled = Math.random() < 2;
declare const api: {
  customers(
    query: { search: string; page: number },
    signal: AbortSignal,
  ): Promise<{ rows: { id: number; name: string }[]; more: boolean }>;
  contacts(customer: number, signal: AbortSignal): Promise<{ id: number; email: string }[]>;
};

// The example of the guide, without casts.
export type Contact = Option<{ email: string }, number>;
export type Customer = Option<{ defaultContact: Contact | null; deliveryHint: string }, number>;
const toCustomer = (row: { id: number; name: string }): Customer => ({
  value: row.id,
  label: row.name,
  defaultContact: null,
  deliveryHint: "",
});
const toContact = (row: { id: number; email: string }): Contact => ({
  value: row.id,
  label: row.email,
  email: row.email,
});
export const sales = defineEndpoints({
  customers: endpoint.options(
    async ({ search, page, signal, scope }): Promise<{ options: Customer[]; more: boolean }> => {
      void (scope satisfies Scope);
      const { rows, more } = await api.customers({ search, page }, signal);
      return { options: rows.map((row) => toCustomer(row)), more };
    },
  ),
  contacts: endpoint.list(async ({ signal }, { customer }: { customer: number }) =>
    (await api.contacts(customer, signal)).map((row) => toContact(row)),
  ),
});
export const { defineForm, field } = createForms({ endpoints: [sales] });
export const order = defineForm({
  fields: {
    customer: field.async("customers", { label: "Customer", required: true }),
    contact: field.async("contacts", { label: "Contact" }),
    note: field.text({ label: "Note" }),
  },
  rules: {
    customer: { onChange: ({ customer }) => ({ contact: customer?.defaultContact ?? null }) },
    contact: {
      params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
    },
    note: { placeholder: ({ customer }) => customer?.deliveryHint },
  },
});
// An async field holds the whole option, read-only in depth, or null.
const values: Equal<
  FormValues<typeof order>,
  { customer: DeepReadonly<Customer> | null; contact: DeepReadonly<Contact> | null; note: string }
> = true;
void values;
// The bound functions are named by the public types.
const bound: {
  defineForm: BoundDefineForm<Merged<[typeof sales]>>;
  field: BoundField<Merged<[typeof sales]>>;
} = { defineForm, field };
const customerField: AsyncDefinition<Customer, {}, "customers"> = order.fields.customer;
void [bound, customerField];

// ------------------------------------------------------------------ data
declare const plain: Option<{
  tags: string[];
  address: { city: string; zip: number | null } | null;
  note?: string | undefined;
}>;
void (plain.address?.city satisfies string | undefined);
// @ts-expect-error value is reserved in the metadata of an option.
export type WithValue = Option<{ value: number }>;
// @ts-expect-error label is reserved in the metadata of an option.
export type WithLabel = Option<{ label: number }>;
// @ts-expect-error A Date is not plain data.
export type WithDate = Option<{ since: Date }>;
// @ts-expect-error A function is not plain data.
export type WithFunction = Option<{ load: () => void }>;
// @ts-expect-error A Map is not plain data.
export type WithMap = Option<{ index: Map<string, number> }>;
interface Declared {
  email: string;
}
// @ts-expect-error Limit: an interface has no implicit index signature.
export type WithInterface = Option<Declared>;
// @ts-expect-error A boolean is not an option value.
export type BooleanValue = Option<{}, boolean>;
// @ts-expect-error Options are read-only in depth.
plain.address = null;
// @ts-expect-error Nested arrays are read-only too.
plain.tags[0] = "x";

// ------------------------------------------------------------- endpoints
type Endpoints<G> = G extends Registry<infer E> ? E : never;
type Kind<E> = E extends Endpoint<infer T, unknown, unknown> ? T : never;
type OptionIn<E> = E extends Endpoint<"options" | "list", infer O, unknown> ? O : never;
type ParamsIn<E> = E extends Endpoint<"options" | "list", unknown, infer P> ? P : never;
type Sales = Endpoints<typeof sales>;
// P comes from the annotation of params, {} without one, and is never any.
const inferred: [
  Equal<ParamsIn<Sales["customers"]>, {}>,
  Equal<ParamsIn<Sales["contacts"]>, { customer: number }>,
  IsAny<ParamsIn<Sales["customers"]>>,
  IsAny<ParamsIn<Sales["contacts"]>>,
  Equal<OptionIn<Sales["customers"]>, Customer>,
  Equal<OptionIn<Sales["contacts"]>, Contact>,
  Equal<Kind<Sales["customers"]>, "options">,
  Equal<Kind<Sales["contacts"]>, "list">,
] = [true, true, false, false, true, true, true, true];
void inferred;
// Inline and without annotations: the option comes from the literal and P is {}.
export const inline = defineEndpoints({
  codes: endpoint.list(() => Promise.resolve([{ value: "a", label: "A", code: 1 }])),
  search: endpoint.options(({ search }) =>
    Promise.resolve({ options: [{ value: 1, label: search }], more: false }),
  ),
  filtered: endpoint.list((_, { q }: { q?: string | undefined }) =>
    Promise.resolve([{ value: q ?? "", label: "Q" }]),
  ),
});
type Inline = Endpoints<typeof inline>;
const inlineTypes: [
  Equal<OptionIn<Inline["codes"]>, { value: string; label: string; code: number }>,
  Equal<ParamsIn<Inline["search"]>, {}>,
  IsAny<ParamsIn<Inline["search"]>>,
  IsAny<ParamsIn<Inline["codes"]>>,
  Equal<ParamsIn<Inline["filtered"]>, { q?: string | undefined }>,
] = [true, true, false, false, true];
void inlineTypes;
// @ts-expect-error A page of options is { options, more }.
endpoint.options(() => Promise.resolve([{ value: 1, label: "A" }]));
// @ts-expect-error A full list is an array of options.
endpoint.list(() => Promise.resolve({ options: [{ value: 1, label: "A" }], more: false }));
// @ts-expect-error An option has a label.
endpoint.list(() => Promise.resolve([{ value: 1 }]));
// @ts-expect-error The metadata of an option is plain data.
endpoint.list(() => Promise.resolve([{ value: 1, label: "A", since: new Date() }]));
// @ts-expect-error Params are plain data.
endpoint.list((_, { since }: { since: Date }) =>
  Promise.resolve([{ value: 1, label: String(since) }]),
);
// @ts-expect-error A registry takes endpoints only.
defineEndpoints({ customers: () => Promise.resolve([]) });

// ----------------------------------------------------------- createForms
// A tuple of registries without as const: the keys of both reach field.async.
const both = createForms({ endpoints: [sales, inline] });
void both.field.async("codes", { default: { value: "a", label: "A", code: 1 } });
void both.field.async("contacts");
const repeated = defineEndpoints({
  contacts: endpoint.list(() => Promise.resolve([{ value: 1, label: "A" }])),
});
// @ts-expect-error The key "contacts" is declared in two registries.
createForms({ endpoints: [sales, inline, repeated] });
// @ts-expect-error endpoints is an array of registries.
createForms({ endpoints: sales });
// @ts-expect-error A registry is created by defineEndpoints.
createForms({ endpoints: [{ customers: sales }] });

// ----------------------------------------------------------- field.async
declare const acme: Customer;
// Every optional property also takes undefined, and default is the whole option.
field.async("customers", {
  label: undefined,
  placeholder: undefined,
  default: enabled ? acme : undefined,
  disabled: undefined,
  readOnly: enabled ? "Closed" : undefined,
  hidden: undefined,
  required: undefined,
});
field.async("customers", { default: null });
field.async("customers", enabled ? undefined : { label: "Customer" });
// @ts-expect-error The key must be an endpoint of the registries.
field.async("custmers");
// @ts-expect-error The default is the whole option, not its value.
field.async("customers", { default: 1 });
// @ts-expect-error The default keeps the metadata of its endpoint.
field.async("customers", { default: { value: 1, label: "Acme" } });
// @ts-expect-error An async field has no static options.
field.async("customers", { options: [] });
// @ts-expect-error The key is positional.
field.async({ endpoint: "customers" });

// Every member of a union of metadata is checked.
// @ts-expect-error A member of a union of metadata cannot declare value.
export type UnionValue = Option<{ value: number } | { other: string }>;
// @ts-expect-error A member of a union of metadata cannot declare label.
export type UnionLabel = Option<{ label: "Other" } | { other: string }>;
