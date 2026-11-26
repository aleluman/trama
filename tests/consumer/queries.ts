// Value queries from the installed package: endpoint.value, the query rule of
// the bound defineForm, its patch and the fit of its result. Positives compile
// without casts; each negative fails for the reason its directive gives.
import {
  createForms,
  declareContext,
  defineEndpoints,
  endpoint,
  type DeepReadonly,
  type Endpoint,
  type Option,
  type Registry,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;
export const enabled = Math.random() < 2;
export type Contact = Option<{ email: string }, number>;
export type Customer = Option<{ deliveryHint: string }, number>;
export type Money = { amount: number; currency: string };
type Mode = { mode: "create" | "edit" | "view"; currency: string };
declare const api: {
  customers(search: string): Promise<{ options: Customer[]; more: boolean }>;
  contacts(customer: number, signal: AbortSignal): Promise<Contact[]>;
  price(customer: number, signal: AbortSignal): Promise<number>;
  rate(currency: string, signal: AbortSignal): Promise<number | undefined>;
  code(): Promise<string>;
  country(): Promise<"ES" | null>;
  money(): Promise<Money>;
  contact(customer: number): Promise<Contact>;
};

// The registry the queries share: pages of options, whole lists and values.
export const sales = defineEndpoints({
  customers: endpoint.options(({ search }) => api.customers(search)),
  contacts: endpoint.list(({ signal }, { customer }: { customer: number }) =>
    api.contacts(customer, signal),
  ),
  allContacts: endpoint.list(({ signal }) => api.contacts(0, signal)),
  unitPrice: endpoint.value(({ signal }, { customer }: { customer: number }) =>
    api.price(customer, signal),
  ),
  rate: endpoint.value(({ signal }, { currency }: { currency?: string }) =>
    api.rate(currency ?? "JPY", signal),
  ),
  code: endpoint.value(() => api.code()),
  country: endpoint.value(() => api.country()),
  money: endpoint.value(() => api.money()),
  mainContact: endpoint.value((_, { customer }: { customer: number }) => api.contact(customer)),
});
export const { defineForm, field } = createForms({ endpoints: [sales] });
// No entry is required: contact lists all the contacts, without params.
export const fields = {
  customer: field.async("customers"),
  contact: field.async("allContacts"),
  price: field.number(),
  quantity: field.number(),
  note: field.text(),
  code: field.select({ options: [{ value: "ES", label: "Spain" }] }),
};

// --------------------------------------------------------- endpoint.value
type Endpoints<G> = G extends Registry<infer E> ? E : never;
type ValueIn<E> = E extends Endpoint<"value", infer V, unknown> ? V : never;
type ParamsIn<E> = E extends Endpoint<"value", unknown, infer P> ? P : never;
type Sales = Endpoints<typeof sales>;
// V comes from the result of load; P from the annotation of params, {} without
// one, and never any. A list is not a value endpoint.
const inferred: [
  Equal<ValueIn<Sales["unitPrice"]>, number>,
  Equal<ValueIn<Sales["rate"]>, number | undefined>,
  Equal<ValueIn<Sales["country"]>, "ES" | null>,
  Equal<ValueIn<Sales["money"]>, Money>,
  Equal<ValueIn<Sales["mainContact"]>, Contact>,
  Equal<ValueIn<Sales["contacts"]>, never>,
  Equal<ParamsIn<Sales["unitPrice"]>, { customer: number }>,
  Equal<ParamsIn<Sales["rate"]>, { currency?: string }>,
  Equal<ParamsIn<Sales["money"]>, {}>,
  IsAny<ParamsIn<Sales["money"]>>,
] = [true, true, true, true, true, true, true, true, true, false];
void inferred;
// Inline and without annotations: V is the plain data of the result.
const nested = endpoint.value(() => Promise.resolve({ lines: [{ sku: "a", total: 1 }] }));
const nestedValue: Equal<
  ValueIn<typeof nested>,
  { lines: { sku: string; total: number }[] }
> = true;
void nestedValue;
// @ts-expect-error A Date is not plain data.
endpoint.value(() => Promise.resolve(new Date()));
// @ts-expect-error Nor a Date inside the result.
endpoint.value(() => Promise.resolve({ at: new Date() }));
// @ts-expect-error Nor a function.
endpoint.value(() => Promise.resolve(() => 1));
// @ts-expect-error A result typed unknown is not known to be plain.
endpoint.value((): Promise<unknown> => Promise.resolve(1));
interface Declared {
  amount: number;
}
// @ts-expect-error Limit: an interface has no implicit index signature.
endpoint.value((): Promise<Declared> => Promise.resolve({ amount: 1 }));
// @ts-expect-error load returns a promise.
endpoint.value(() => 1);
// @ts-expect-error Params are plain data too.
endpoint.value((_, { at }: { at: Date }) => Promise.resolve(at.getTime()));
// @ts-expect-error A value endpoint is not an async field: it takes options and lists.
field.async("unitPrice");
// @ts-expect-error Neither with an object result.
field.async("money");

// ------------------------------------------------------------------ query
// A value and a whole list, whose params follow the rule of params.
defineForm({
  fields,
  rules: {
    price: {
      query: {
        endpoint: "unitPrice",
        params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
      },
    },
    contact: {
      query: {
        endpoint: "contacts",
        params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
        patch: (options, { values }) =>
          values.contact === null && options.length === 1 ? { contact: options[0] } : undefined,
      },
    },
  },
});
// Optional params: omitted (below, in fit), undefined, a formula or one that
// suspends; required params may read with peek.
defineForm({ fields, rules: { quantity: { query: { endpoint: "rate", params: undefined } } } });
defineForm({
  fields,
  rules: {
    quantity: { query: { endpoint: "rate", params: () => ({ currency: "EUR" }) } },
    code: { query: { endpoint: "country", params: ({ note }) => (note === "" ? undefined : {}) } },
    price: {
      query: { endpoint: "unitPrice", params: (_, { peek }) => ({ customer: peek.quantity ?? 0 }) },
    },
  },
});
// @ts-expect-error A paged endpoint cannot be queried.
defineForm({ fields, rules: { note: { query: { endpoint: "customers" } } } });
// @ts-expect-error params is required when the endpoint requires params.
defineForm({ fields, rules: { price: { query: { endpoint: "unitPrice" } } } });
defineForm({
  fields,
  // @ts-expect-error params cannot be undefined then.
  rules: { price: { query: { endpoint: "unitPrice", params: undefined } } },
});
defineForm({
  fields,
  // @ts-expect-error The result of params must fit the params of the endpoint.
  rules: { price: { query: { endpoint: "unitPrice", params: () => ({ customer: "1" }) } } },
});
defineForm({
  fields,
  // @ts-expect-error null does not suspend; only undefined does.
  rules: { price: { query: { endpoint: "unitPrice", params: () => null } } },
});
// @ts-expect-error An unknown endpoint; limit: the message only says never.
defineForm({ fields, rules: { price: { query: { endpoint: "nope" } } } });

// ------------------------------------------------------------------ patch
// The result is the value, or the whole list, read-only in depth.
defineForm({
  fields,
  rules: {
    price: {
      query: {
        endpoint: "unitPrice",
        params: () => ({ customer: 1 }),
        patch: (price, { values }) => {
          void (true satisfies Equal<typeof price, number>);
          return { price, quantity: values.quantity ?? 1 };
        },
      },
    },
    quantity: {
      query: {
        endpoint: "rate",
        patch: (rate) => (rate === undefined ? undefined : { quantity: rate }),
      },
    },
    note: {
      query: {
        endpoint: "money",
        patch: (money, { values }) => {
          void (true satisfies Equal<typeof money, DeepReadonly<Money>>);
          // @ts-expect-error The result is read-only in depth.
          money.amount = 1;
          // @ts-expect-error So are the values.
          values.note = "";
          return { note: `${money.amount} ${money.currency}` };
        },
      },
    },
    contact: {
      query: {
        endpoint: "contacts",
        params: () => ({ customer: 1 }),
        patch: (options) => {
          void (true satisfies Equal<typeof options, readonly DeepReadonly<Contact>[]>);
          // @ts-expect-error So is the list.
          options.length = 0;
          return { contact: options[0] ?? null };
        },
      },
    },
  },
});
// With a declared context, params and patch read it.
defineForm({
  fields,
  context: declareContext<Mode>(),
  rules: {
    quantity: {
      query: {
        endpoint: "rate",
        params: (_, { peek, context }) => ({
          currency: peek.note === "" ? context.currency : peek.note,
        }),
        patch: (rate, { values, context }) =>
          context.mode === "view" || values.quantity !== null ? undefined : { quantity: rate },
      },
    },
  },
});
// The tools of patch: values, and context only when the form declares one.
defineForm({
  fields,
  rules: {
    // @ts-expect-error A form without context gives no context to patch.
    note: { query: { endpoint: "code", patch: (_, { context }) => ({ note: String(context) }) } },
    // @ts-expect-error patch reads the values as data: it has no peek.
    price: { query: { endpoint: "rate", patch: (_, { peek }) => ({ note: String(peek) }) } },
    quantity: {
      // @ts-expect-error Nor toDefaults, which only events have.
      query: { endpoint: "rate", patch: (_, { toDefaults }) => ({ note: String(toDefaults) }) },
    },
  },
});
defineForm({
  fields,
  // @ts-expect-error patch writes fields of the form: not an unknown one in a literal.
  rules: { price: { query: { endpoint: "rate", patch: () => ({ total: 1 }) } } },
});
const reusedPatch = (rate: number | undefined) => ({ price: rate, total: 1 });
// @ts-expect-error Nor in a reused function.
defineForm({ fields, rules: { price: { query: { endpoint: "rate", patch: reusedPatch } } } });
// @ts-expect-error A patch is an object or undefined.
defineForm({ fields, rules: { price: { query: { endpoint: "rate", patch: (rate) => rate } } } });
const later = (rate: number | undefined) => Promise.resolve({ price: rate });
// @ts-expect-error patch is synchronous.
defineForm({ fields, rules: { price: { query: { endpoint: "rate", patch: later } } } });

// -------------------------------------------------------------------- fit
// Without patch the result is written to the field of the entry: a number in
// a number, number | undefined too, a string in a text, a literal in a select
// and an option in an async field of that option.
defineForm({
  fields,
  rules: {
    price: { query: { endpoint: "unitPrice", params: () => ({ customer: 1 }) } },
    quantity: { query: { endpoint: "rate" } },
    note: { query: { endpoint: "code" } },
    code: { query: { endpoint: "country" } },
    contact: { query: { endpoint: "mainContact", params: () => ({ customer: 1 }) } },
  },
});
// With patch, the result does not need to fit the field.
defineForm({
  fields,
  rules: { price: { query: { endpoint: "code", patch: (note) => ({ note }) } } },
});
// @ts-expect-error A string does not fit a number.
defineForm({ fields, rules: { price: { query: { endpoint: "code" } } } });
// @ts-expect-error number | undefined does not fit a text.
defineForm({ fields, rules: { note: { query: { endpoint: "rate" } } } });
// @ts-expect-error A string does not fit a select of literals.
defineForm({ fields, rules: { code: { query: { endpoint: "code" } } } });
defineForm({
  fields,
  // @ts-expect-error A whole list does not fit a field.
  rules: { contact: { query: { endpoint: "contacts", params: () => ({ customer: 1 }) } } },
});
defineForm({
  fields,
  // @ts-expect-error An option of another endpoint does not fit an async field.
  rules: { customer: { query: { endpoint: "mainContact", params: () => ({ customer: 1 }) } } },
});
// @ts-expect-error An explicit undefined patch is no patch.
defineForm({ fields, rules: { price: { query: { endpoint: "code", patch: undefined } } } });
