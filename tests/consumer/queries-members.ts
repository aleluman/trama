// Queries in the shapes of members.ts, in the defineForm of the core and in
// rules that may be undefined; snapshot.queries, retry and the scope of the
// sessions they open. Positives compile without casts; each negative fails for
// the reason its directive gives.
import {
  createSession,
  defineForm as coreDefineForm,
  type FormDefinition,
  type FormQueries,
  type QueryState,
  type Session,
} from "trama-forms/core";
import { createReactBinding, type NumberFieldProps, type TextFieldProps } from "trama-forms/react";
import { defineForm, enabled, field, fields } from "./queries.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const priceQuery = { endpoint: "unitPrice", params: () => ({ customer: 1 }) } as const;
const rateQuery = { endpoint: "rate" } as const;
const codeQuery = { endpoint: "code" } as const;
const moneyNote = { endpoint: "money", patch: () => ({ note: "money" }) } as const;

// --------------------------------------------------------------- the core
const coreFields = { price: field.number() };
// An explicit undefined is omitting query, as in every optional property.
coreDefineForm({ fields: coreFields, rules: { price: { query: undefined } } });
// @ts-expect-error The defineForm of trama-forms/core has no endpoints to query.
coreDefineForm({ fields: coreFields, rules: { price: { query: { endpoint: "rate" } } } });
// @ts-expect-error Nor a reused query.
coreDefineForm({ fields: coreFields, rules: { price: { query: rateQuery } } });

// ----------------------------------------------------------------- shapes
// Conditional and optional entries, reused queries with as const and a union
// of valid queries compile.
const optionalEntry: { readonly query?: typeof rateQuery } = { query: rateQuery };
const noteQuery = (on: boolean): typeof codeQuery | typeof moneyNote =>
  on ? codeQuery : moneyNote;
defineForm({
  fields,
  rules: {
    ...(enabled && { price: { query: priceQuery } }),
    ...(enabled ? { code: { query: { endpoint: "country" } } } : {}),
    quantity: optionalEntry,
    note: { query: noteQuery(enabled) },
  },
});
const widened = { endpoint: "rate" };
// @ts-expect-error A reused query without as const has endpoint: string.
defineForm({ fields, rules: { quantity: { query: widened } } });
defineForm({
  fields,
  // @ts-expect-error query property "parms" does not exist.
  rules: { quantity: { query: { endpoint: "rate", parms: () => ({}) } } },
});
const misspelled = { endpoint: "rate", parms: () => ({ currency: "EUR" }) } as const;
// @ts-expect-error Nor in a reused query.
defineForm({ fields, rules: { quantity: { query: misspelled } } });
// @ts-expect-error A conditional entry cannot hide a misspelled query property.
defineForm({ fields, rules: { ...(enabled && { quantity: { query: misspelled } }) } });
const optionalMisspelled: { readonly query?: typeof misspelled } = { query: misspelled };
// @ts-expect-error Nor an optional entry.
defineForm({ fields, rules: { quantity: optionalMisspelled } });
// @ts-expect-error A conditional entry cannot hide a result that does not fit.
defineForm({ fields, rules: { ...(enabled && { price: { query: codeQuery } }) } });
const badNote = (on: boolean): typeof codeQuery | typeof rateQuery => (on ? codeQuery : rateQuery);
// @ts-expect-error A valid member of a union of queries does not absorb a result that does not fit.
defineForm({ fields, rules: { note: { query: badNote(enabled) } } });
const typoQuery = { endpoint: "code", parms: () => ({}) } as const;
const typoNote = (on: boolean): typeof codeQuery | typeof typoQuery => (on ? codeQuery : typoQuery);
// @ts-expect-error Nor a misspelled property.
defineForm({ fields, rules: { note: { query: typoNote(enabled) } } });
const totalQuery = { endpoint: "code", patch: () => ({ total: 1 }) } as const;
const totalNote = (on: boolean): typeof moneyNote | typeof totalQuery =>
  on ? moneyNote : totalQuery;
// @ts-expect-error Nor an unknown field of a patch.
defineForm({ fields, rules: { note: { query: totalNote(enabled) } } });
// A helper may return a union of whole sections; each member is checked.
const withQuery = { price: { query: priceQuery } };
const withoutQuery = { note: { hidden: () => true } };
const badRules = { price: { query: codeQuery } };
const rulesFrom = (on: boolean): typeof withQuery | typeof withoutQuery =>
  on ? withQuery : withoutQuery;
const badFrom = (on: boolean): typeof withQuery | typeof badRules => (on ? withQuery : badRules);
const union = defineForm({ fields, rules: rulesFrom(enabled) });
// @ts-expect-error A union of rules sections cannot hide a result that does not fit.
defineForm({ fields, rules: badFrom(enabled) });

// -------------------------------------------- rules that may be undefined
// @ts-expect-error Rules that may be undefined cannot declare queries.
defineForm({ fields, rules: enabled ? { price: { query: priceQuery } } : undefined });
// Without queries they can; and an entry or a query may be undefined.
defineForm({ fields, rules: enabled ? { note: { hidden: () => true } } : undefined });
defineForm({ fields, rules: undefined });
const maybeEntry = defineForm({
  fields,
  rules: { price: enabled ? { query: priceQuery } : undefined },
});
const maybeQuery = defineForm({
  fields,
  rules: { price: { query: enabled ? priceQuery : undefined } },
});

// ------------------------------------------------------ queries and retry
// A sure query has a required key; one that may be missing, an optional key;
// an entry without query, none.
const order = defineForm({
  fields,
  rules: {
    price: { query: priceQuery },
    quantity: { query: enabled ? rateQuery : undefined },
    note: { hidden: () => false },
    ...(enabled && { code: { query: { endpoint: "country" } } }),
  },
});
type Optional = { readonly price?: QueryState };
const shapes: [
  Equal<
    FormQueries<typeof order>,
    { readonly price: QueryState; readonly quantity?: QueryState; readonly code?: QueryState }
  >,
  Equal<FormQueries<typeof union>, Optional>,
  Equal<FormQueries<typeof maybeEntry>, Optional>,
  Equal<FormQueries<typeof maybeQuery>, Optional>,
  Equal<
    QueryState,
    { readonly status: "idle" | "pending" | "error"; readonly error: Error | undefined }
  >,
] = [true, true, true, true, true];
void shapes;
const session = createSession(order, { scope: "acme" });
const { queries } = session.getSnapshot();
void (queries.price.status satisfies "idle" | "pending" | "error");
void (queries.price.error satisfies Error | undefined);
void (queries.quantity?.status satisfies QueryState["status"] | undefined);
session.retry("price");
session.retry("quantity");
session.retry("code");
// @ts-expect-error An optional key may be missing.
void queries.quantity.status;
// @ts-expect-error An entry without query has no key.
void queries.note;
// @ts-expect-error The state of a query is read-only.
queries.price.status = "idle";
// @ts-expect-error So are the queries.
queries.price = { status: "idle", error: undefined };
// @ts-expect-error retry takes an entry with query.
session.retry("note");
// @ts-expect-error Not any field.
session.retry("contact");
// A form without queries publishes {}, and needs no scope.
const plain = defineForm({
  fields: { note: field.text() },
  rules: { note: { hidden: () => true } },
});
const empty = createSession(plain).getSnapshot().queries;
const core = coreDefineForm({ fields: coreFields });
const none: [Equal<typeof empty, {}>, Equal<FormQueries<typeof core>, {}>] = [true, true];
void none;
// @ts-expect-error Without queries, retry takes no name.
createSession(plain).retry("note");

// A generic function keeps the names of the definition it receives.
const failed = <D extends FormDefinition>(target: Session<D>) =>
  Object.values(target.getSnapshot().queries).filter((state) => state.status === "error").length;
const retry = <D extends FormDefinition>(target: Session<D>, name: keyof FormQueries<D> & string) =>
  target.retry(name);
void failed(session);
retry(session, "price");
// @ts-expect-error The names are those of the definition.
retry(session, "note");
// The wide definition takes any name, and every state may be missing.
const wide: Session<FormDefinition> = session;
wide.retry("anything");
void (wide.getSnapshot().queries.anything?.status satisfies QueryState["status"] | undefined);

// ------------------------------------------------------------------ scope
const priced = defineForm({
  fields: { price: field.number(), note: field.text() },
  rules: { price: { query: rateQuery } },
});
const maybePriced = defineForm({
  fields: { price: field.number() },
  rules: { price: { query: enabled ? rateQuery : undefined } },
});
createSession(priced, { scope: "acme" });
// @ts-expect-error A form with queries requires the options.
createSession(priced);
// @ts-expect-error And a scope among them.
createSession(priced, {});
// @ts-expect-error scope cannot be undefined then.
createSession(priced, { scope: undefined });
// @ts-expect-error Also when the query may be missing.
createSession(maybePriced, {});
// And when the queries are a union whose members share no key.
type Either = FormQueries<typeof priced> | { readonly note: QueryState };
const either: FormDefinition<(typeof priced)["fields"], {}, undefined, Either> = priced;
// @ts-expect-error scope is required when a member of the union has queries.
createSession(either, {});
const number = (props: NumberFieldProps) => props.value;
const text = (props: TextFieldProps) => props.value;
const ui = createReactBinding({ number, text });
export function usePriceRetry(company: string) {
  const editor = ui.useFormSession(priced, { key: company, scope: company });
  if (editor.status !== "ready") return null;
  const { session: opened } = editor;
  const { price } = opened.getSnapshot().queries;
  return price.status === "error" ? () => opened.retry("price") : null;
}
export function useMissingScope() {
  // @ts-expect-error useFormSession requires a scope with queries.
  ui.useFormSession(priced, { key: "1" });
  // @ts-expect-error And the options.
  ui.useFormSession(priced);
}

// ------------------------------------------ sections and patches that may be missing
// Rules that may be left out by a spread must still be there when they declare queries.
const queryRules = { price: { query: priceQuery } };
// @ts-expect-error Rules that declare queries cannot be left out.
defineForm({ fields, ...(enabled ? { rules: queryRules } : {}) });
defineForm({ fields, ...(enabled ? { rules: { note: { hidden: () => true } } } : {}) });
// A patch that may be missing leaves the result to fit the field.
const maybePatch = enabled ? () => ({ price: 1 }) : undefined;
// @ts-expect-error Without that patch, the text result of code does not fit price.
defineForm({ fields, rules: { price: { query: { endpoint: "code", patch: maybePatch } } } });
defineForm({ fields, rules: { price: { query: { endpoint: "rate", patch: maybePatch } } } });
