// An application without TanStack Query, which emits declarations: every exported type must
// be named from the package.
import { submissionEmitted, submissionReconsumed } from "./package-submit.mjs";
export const independent = `
import {
  createForms,
  createSession,
  defineEndpoints,
  defineForm as defineCoreForm,
  endpoint,
  field as coreField,
} from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
const form = defineCoreForm({ fields: { title: coreField.text() } });
createReactBinding({ text: () => null }).useFormSession(form);
createSession(form).edit("title", "Built declarations");
void initialFromQuery;
// An application that emits declarations names its registry, its bound forms and their lists.
export const sales = defineEndpoints({
  customers: endpoint.options(async ({ search }) => ({
    options: [{ value: 1, label: search }],
    more: false,
  })),
});
export const { defineForm, defineRules, field } = createForms({ endpoints: [sales] });
export const order = defineForm({ fields: { customer: field.async("customers") } });
export const customers = createSession(order, { scope: "acme" }).list("customer");
// @ts-expect-error Internal paths are not package exports.
import "trama-forms/src/core/index.js";
// A form with a context names its declaration, and its sessions take the context.
import { declareContext } from "trama-forms/core";
export const mode = declareContext<{ mode: "edit" | "view" }>();
export const viewed = createSession(defineCoreForm({ context: mode, fields: form.fields }), { context: { mode: "view" } });
// A form with a query names the state of each query of its sessions.
const quoted = createForms({ endpoints: [defineEndpoints({ rate: endpoint.value(() => Promise.resolve(1)) })] });
export const rates = createSession(quoted.defineForm({ fields: { rate: quoted.field.number() }, rules: { rate: { query: { endpoint: "rate" } } } }), { scope: 1 }).getSnapshot().queries;
// A form with rows names the keys of its rows, their handles and the keys of each collection.
const withRows = defineCoreForm({ fields: { note: coreField.text() }, collections: { lines: { fields: { amount: coreField.number() } } } });
const rowsSession = createSession(withRows, { initial: { lines: [{ amount: 1 }] } });
export const [added] = rowsSession.add("lines", [{}]);
export const line = rowsSession.row("lines", added);
export const keys = rowsSession.getSnapshot().rows;
// Code over the wide handle names its snapshot and the fields of any row from the package.
import type { RowHandle, RowSnapshot } from "trama-forms/core";
export const wideSnapshot = (row: RowHandle) => row.getSnapshot();
export const wideEdit = (row: RowHandle) => row.edit;
export const snapshotValues = (snapshot: RowSnapshot) => snapshot.values;
export const snapshotStates = (snapshot: RowSnapshot) => snapshot.fieldStates;
// A form with async fields in its rows names the handles of its rows and their lists.
export const lined = defineForm({ fields: { note: field.text() }, collections: { lines: { fields: { customer: field.async("customers") } } } });
const linedSession = createSession(lined, { scope: "acme" });
export const [linedKey] = linedSession.add("lines", [{}]);
export const linedRow = linedSession.row("lines", linedKey);
export const lineCustomers = linedRow.list("customer");
export const wideList = (row: RowHandle) => row.list;
// A form with queries in its rows names the state of each query of a row.
const priced = createForms({ endpoints: [defineEndpoints({ price: endpoint.value(() => Promise.resolve(1)) })] });
export const pricedForm = priced.defineForm({ fields: {}, collections: { lines: { fields: { price: priced.field.number() } } }, rules: { lines: { each: { price: { query: { endpoint: "price" } } } } } });
const pricedSession = createSession(pricedForm, { scope: 1 });
export const pricedRow = pricedSession.row("lines", pricedSession.add("lines", [{}])[0]);
export const priceState = pricedRow.getSnapshot()?.queries.price;
export const wideRetry = (row: RowHandle) => row.retry;
export const wideQueries = (snapshot: RowSnapshot) => snapshot.queries;
// Dates and multiple values name their definitions, and a remote multiple
// field its list, by session and by row.
export const report = defineForm({
  fields: { from: field.date(), kinds: field.multiSelect({ options: [{ value: "sale", label: "Sale" }] }) },
  collections: { lines: { fields: { families: field.multiAsync("customers") } } },
});
const reportSession = createSession(report, { scope: "acme" });
export const [reportKey] = reportSession.add("lines", [{}]);
export const familyList = reportSession.row("lines", reportKey).list("families");
`;

// Rule sets, from modules of their own: a bound set with rows, a query and
// params, a set of the core and a preset, whose declarations name RuleSet with
// what they derive and not their rules; and a form that includes them, with
// its session, in another module.
export const sets = `
import { createForms, defineEndpoints, defineRules, endpoint, field } from "trama-forms/core";
const books = defineEndpoints({
  titles: endpoint.list((_, { author }: { author: string }) => Promise.resolve([{ value: 1, label: author }])),
  stock: endpoint.value(() => Promise.resolve(3)),
});
export const library = createForms({ endpoints: [books] });
export const shelf = {
  fields: { author: library.field.text(), note: library.field.text() },
  collections: { loans: { fields: { title: library.field.async("titles"), copies: library.field.number() } } },
};
export const titles = library.defineRules({
  ...shelf,
  rules: {
    loans: {
      each: {
        title: { params: (_, { values }) => ({ author: values.author }) },
        copies: { query: { endpoint: "stock" } },
      },
    },
  },
});
export const noted = defineRules({
  fields: { note: field.text() },
  rules: { note: { hidden: ({ note }) => note === "" } },
});
export const shelfPreset = [titles, noted] as const;
`;
export const forms = `
import { createSession, type FormDefinition, type Session } from "trama-forms/core";
import { library, shelf, shelfPreset } from "./sets.js";
export const loanForm = library.defineForm({ ...shelf, include: shelfPreset });
export const loanSession = createSession(loanForm, { scope: "acme" });
// A helper over the wide session, as in the guide.
export const resetAll = (sessions: readonly Session<FormDefinition>[]) =>
  sessions.forEach((session) => session.reset());
`;

// A module that imports the declarations emitted for the sets, composes them
// again, reads the queries of the rows and passes the session to a wide helper.
export const recomposed = `
import type { RowQueries, QueryState } from "trama-forms/core";
import { library, noted, shelf, shelfPreset, titles } from "./declarations/sets.js";
import { loanSession, resetAll } from "./declarations/forms.js";
resetAll([loanSession]);
const again = library.defineForm({ ...shelf, include: [...shelfPreset] });
const reordered = library.defineForm({ ...shelf, include: [noted, titles] });
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const queries: [
  Equal<RowQueries<typeof again, "loans">, { readonly copies: QueryState }>,
  Equal<RowQueries<typeof reordered, "loans">, { readonly copies: QueryState }>,
  Equal<RowQueries<typeof loanSession.definition, "loans">, { readonly copies: QueryState }>,
] = [true, true, true];
void queries;
// @ts-expect-error rule set requires field "author"
library.defineForm({ fields: { note: library.field.text() }, collections: shelf.collections, include: [titles] });
`;

// A module that exports the binding, whole and destructured, with renderers
// inline and annotated: its declarations name the binding from the package.
export const ui = `
import { createElement } from "react";
import { createReactBinding, type NumberFieldProps, type TextFieldProps } from "trama-forms/react";
const TextInput = (props: TextFieldProps) => createElement("input", { id: props.id, value: props.value });
const NumberInput = ({ value }: NumberFieldProps) => createElement("output", null, value);
export const binding = createReactBinding({ text: TextInput, number: NumberInput });
export const { Field, useFormSession } = createReactBinding({
  text: TextInput,
  number: NumberInput,
  async: ({ value, placeholder }) => createElement("span", null, value?.label ?? placeholder),
});
// Code generic on the form or on the registry expands the types of the binding.
import type { FormDefinition, Session, TextDefinition } from "trama-forms/core";
type Texts = FormDefinition<Record<string, TextDefinition>>;
export const forward = <D extends Texts, K extends keyof D["fields"] & string>(session: Session<D>, name: K) =>
  createElement(Field<D, K>, { session, name });
export const fieldFor = <D extends Texts, K extends keyof D["fields"] & string>() => Field<D, K>;
type Registry = Parameters<typeof createReactBinding>[0];
export const makeBinding = <R extends Registry>(registry: R & Record<Exclude<keyof R, keyof Registry>, never>) =>
  createReactBinding(registry);
// A hook specialized for a form keeps its name with an annotation.
export const useFor = <D extends Texts>(): typeof useFormSession<D> => useFormSession<D>;
`;

// A module that renders forms with the declarations emitted for the binding,
// and keeps the relation between the session, the field and the renderers.
export const reconsumedUi = `
import { binding, Field, useFormSession } from "./declarations/ui.js";
import { loanForm } from "./declarations/forms.js";
export const Loans = () => {
  const editor = useFormSession(loanForm, { scope: "acme" });
  if (editor.status !== "ready") return null;
  // @ts-expect-error Unknown field
  void <Field session={editor.session} name="missing" />;
  return <Field session={editor.session} name="author" placeholder="Author" />;
};
// @ts-expect-error A form with async fields requires a scope
export const unscoped = () => useFormSession(loanForm);
// @ts-expect-error The binding has no async renderer
export const uncovered = () => binding.useFormSession(loanForm, { scope: "acme" });
`;

// Forms with subtypes: a descriptor exported apart and joined by shorthand,
// a search whose columns its endpoint checks, a form and a rule set.
export const subtyped = `
import { createForms, defineEndpoints, endpoint, subtype, type OptionKey } from "trama-forms/core";
const people = defineEndpoints({
  people: endpoint.options(() =>
    Promise.resolve({ options: [{ value: 1, label: "Ada", credit: 100 }], more: false }),
  ),
});
export const textarea = subtype.text<{ rows?: number }>();
export const forms = createForms({
  endpoints: [people],
  subtypes: { textarea, toggle: subtype.checkbox(), search: subtype.async<{ columns: readonly OptionKey[] }>() },
});
export const { field, defineForm, defineRules } = forms;
export const notes = field.textarea({ presentation: { rows: 4 } });
export const customer = field.search("people", { presentation: { columns: ["label", "credit"] } });
export const invoice = defineForm({
  fields: { notes, customer, urgent: field.toggle() },
  collections: { lines: { fields: { done: field.toggle() } } },
});
export const urgency = defineRules({ fields: { urgent: field.toggle() }, rules: { urgent: { hidden: () => true } } });
`;

// The binding of those forms, whole and destructured, with renderers inline
// and written apart.
export const subtypedUi = `
import { createElement } from "react";
import { createReactBinding, type CheckboxFieldProps, type SubtypeProps, type TextFieldProps } from "trama-forms/react";
import { forms } from "./subtyped.js";
const TextInput = (props: TextFieldProps) => createElement("input", { id: props.id, value: props.value });
const Toggle = ({ value }: CheckboxFieldProps) => createElement("output", null, String(value));
export const SearchTable = ({ presentation }: SubtypeProps<typeof forms, "search">) =>
  createElement("table", null, presentation.columns.join(", "));
export const subtypedBinding = createReactBinding(
  {
    text: TextInput,
    textarea: ({ value, presentation }) => createElement("textarea", { value, rows: presentation?.rows }),
    toggle: Toggle,
    search: SearchTable,
  },
  { forms },
);
export const { Field: SubtypedField, useFormSession: useSubtyped } = subtypedBinding;
`;

// A module that composes and renders again from the declarations emitted.
export const reconsumedSubtypes = `
import { customer, forms, invoice, urgency } from "./declarations/subtyped.js";
import { SubtypedField, useSubtyped } from "./declarations/subtyped-ui.js";
forms.defineForm({ fields: { urgent: forms.field.toggle() }, include: [urgency] });
export const columns: readonly ("value" | "label" | "credit")[] = customer.presentation.columns;
export const Invoice = () => {
  const editor = useSubtyped(invoice, { scope: 1 });
  if (editor.status !== "ready") return null;
  return <SubtypedField session={editor.session} name="notes" />;
};
// @ts-expect-error A column of another endpoint
forms.field.search("people", { presentation: { columns: ["zone"] } });
`;

// Validation and dirty: the texts of the application, the messages of a row,
// of a collection and of the form, and the states of the form and of a row,
// which the declarations name without a path of the package.
export const validated = `
import { createForms, createSession, type RowSnapshot } from "trama-forms/core";
export const checks = createForms({ endpoints: [], messages: { required: ({ label }) => (label ?? "It") + " is required" } });
export const ledger = checks.defineForm({
  fields: { title: checks.field.text({ required: true }) },
  collections: { lines: { fields: { debit: checks.field.number({ min: 0 }) } } },
  rules: { lines: {
    row: { error: ({ debit }) => debit === null && "Complete the debit" },
    collection: { warning: ({ lines }) => lines.length > 9 && "Many lines" },
  } },
  form: { error: ({ title }) => title === "x" && "Another title" },
});
export const ledgerSession = createSession(ledger);
export const [ledgerKey] = ledgerSession.add("lines", [{}]);
export const ledgerState = ledgerSession.getSnapshot().form;
const line = ledgerSession.row("lines", ledgerKey).getSnapshot();
if (line === undefined) throw new Error("The line exists");
export const ledgerLine = line;
export const counts = (snapshot: RowSnapshot) =>
  [snapshot.errorCount, snapshot.warningCount, snapshot.dirty] as const;
`;

// A module that reads the states and defines again from the declarations
// emitted for validation.
export const revalidated = `
import { checks, counts, ledgerLine, ledgerSession, ledgerState } from "./declarations/validated.js";
const errors: number = ledgerState.errorCount;
const warnings: readonly string[] = ledgerState.collections.lines.warnings;
const dirty: boolean = ledgerLine.dirty;
const [rowErrors]: readonly [number, number, boolean] = counts(ledgerLine);
const titleErrors: readonly string[] = ledgerSession.getSnapshot().fieldStates.title.errors;
checks.defineForm({ fields: { note: checks.field.text({ required: "Write a note" }) } });
// @ts-expect-error error messages cannot be empty
checks.defineForm({ fields: { note: checks.field.text() }, rules: { note: { error: () => "" } } });
void [errors, warnings, dirty, rowErrors, titleErrors];
`;

// The application's modules by file name: those that emit declarations, and
// those that compile from them.
export const emittedModules = {
  "independent.ts": independent,
  "sets.ts": sets,
  "forms.ts": forms,
  "ui.ts": ui,
  "subtyped.ts": subtyped,
  "subtyped-ui.ts": subtypedUi,
  "validated.ts": validated,
  ...submissionEmitted,
};
export const reconsumedModules = {
  "recomposed.ts": recomposed,
  "reconsumed-ui.tsx": reconsumedUi,
  "reconsumed-subtypes.tsx": reconsumedSubtypes,
  "revalidated.ts": revalidated,
  ...submissionReconsumed,
};
