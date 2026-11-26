// A session and a row handle are their wide types also when TypeScript compares
// them by structure, as it does behind an alias of a concrete definition.
import {
  createForms,
  createSession,
  declareContext,
  defineEndpoints,
  defineForm as defineCoreForm,
  endpoint,
  field as coreField,
  type FormDefinition,
  type OptionList,
  type RowHandle,
  type Session,
} from "trama-forms/core";

const catalog = defineEndpoints({
  products: endpoint.list(() => Promise.resolve([{ value: "p", label: "P" }])),
  stocks: endpoint.list(() => Promise.resolve([{ value: 1, label: "Central", available: 3 }])),
});
const { defineForm, field } = createForms({ endpoints: [catalog] });
const order = defineForm({
  fields: { product: field.async("products"), note: field.text() },
  collections: { lines: { fields: { amount: field.number() } } },
});
// Without async fields, list takes no name, and the comparison failed all the same.
const plain = defineForm({ fields: { note: field.text() } });

type Aliased<D extends FormDefinition> = Session<D>;
declare const aliased: Aliased<typeof order>;
declare const aliasedPlain: Aliased<typeof plain>;
export const structural: Session<FormDefinition> = aliased;
export const structuralPlain: Session<FormDefinition> = aliasedPlain;

const orderSession = createSession(order, { scope: "acme" });
const [key] = orderSession.add("lines", [{}]);
export const wide: RowHandle = orderSession.row("lines", key);

// Session is covariant in its definition: between two sessions written as
// Session<…>, what one definition accepts of the other decides.
declare const either: Session<typeof order> | Session<typeof plain>;
export const eitherSession: Session<typeof order | typeof plain> = either;
// As in the guide.
export const resetAll = (sessions: readonly Session<FormDefinition>[]) =>
  sessions.forEach((session) => session.reset());
resetAll([orderSession, createSession(plain)]);
export const widen = <D extends FormDefinition>(concrete: Session<D>): Session<FormDefinition> =>
  concrete;
export const watchWide = (target: Session<FormDefinition>) => target.watchOutputs(() => {});

const note = { note: coreField.text() };
const narrow = defineCoreForm({ context: declareContext<{ mode: "a" }>(), fields: note });
const loose = defineCoreForm({ context: declareContext<{ mode?: "a" | "b" }>(), fields: note });
declare const narrowSession: Session<typeof narrow>;
declare const looseSession: Session<typeof loose>;
export const narrowLoose: Session<typeof loose> = narrowSession;
// @ts-expect-error A session of a wider context
export const fromLoose: Session<typeof narrow> = looseSession;

// A union of names still gives one list, of the union of their options, which a
// generic helper over OptionList takes.
const both = defineForm({
  fields: { product: field.async("products"), stock: field.async("stocks") },
});
const bothSession = createSession(both, { scope: "acme" });
declare const selected: "product" | "stock";
const optionsOf = <O>(list: OptionList<O>) => list.getSnapshot().options;
export const selectedOptions = optionsOf(bothSession.list(selected));
