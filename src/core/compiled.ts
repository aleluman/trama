// The compiled form of a definition, which only the engine reads.
import type { Messages } from "./messages.js";
import type { FieldDefinition } from "./fields.js";
import type { ResolvedEndpoint } from "./endpoints.js";
import type { CompiledOutputs } from "./outputs.js";
import type { CompiledQuery } from "./params.js";
import type { EachObserver, FieldEvent, FieldFormula, Observer, StateFormula } from "./rules.js";
import type { CompiledCollection } from "./collections.js";
import type { States } from "./states.js";
import type { FormDefinition } from "./definition.js";

// The endpoints of the registries of createForms, by key; the defineForm of
// the core has none.
export type EndpointTable = ReadonlyMap<string, ResolvedEndpoint>;
export type Compiled = {
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  // The value formula of each field, the event of each field whose change runs
  // it, and the formulas that observe the resolved values in declaration
  // order: the formulas of state and params of the entries of rules, then the
  // lock of the form.
  readonly formulas: ReadonlyMap<string, FieldFormula>;
  readonly events: ReadonlyMap<string, FieldEvent>;
  readonly hasEdits: boolean;
  readonly hasRelations: boolean;
  readonly observers: readonly (Observer | EachObserver)[];
  // The formulas of state of the header among them, which combine into field
  // states, and the lock, which also reaches the fields of rows.
  readonly states: readonly StateFormula[];
  readonly locks: readonly StateFormula[];
  // The messages of the collections and of the form, in declaration order.
  readonly own: readonly StateFormula[];
  // Each collection, in declaration order, and the header fields and the
  // collections as own keys, which the views of the form answer.
  readonly collections: ReadonlyMap<string, CompiledCollection>;
  readonly shape: object;
  // The position of each field of the header in the traversal, 2i for the
  // field at index i in declaration order.
  readonly positions: ReadonlyMap<string, number>;
  // The state each field declares, where its contributions start.
  readonly declared: States;
  readonly outputs: CompiledOutputs;
  // The endpoint of each async field, and the query of each entry that has one.
  readonly endpoints: EndpointTable;
  readonly queries: ReadonlyMap<string, CompiledQuery>;
  // Whether the form declares a context, and the defaults it gives from it.
  readonly context: boolean;
  readonly defaults: ((context: object) => unknown) | undefined;
  // The texts of validation of its createForms, or the defaults.
  readonly messages: Messages;
  // The default of each field, or the empty of its type.
  readonly fieldDefaults: Readonly<Record<string, unknown>>;
};
// Identity is the only link between a definition and its compiled form, so
// copies and hand-written objects are rejected instead of opening without rules.
const compiled = new WeakMap<object, Compiled>();
export const register = (definition: FormDefinition, form: Compiled) => {
  compiled.set(definition, form);
};
export const compiledFor = (definition: FormDefinition): Compiled => {
  const found = compiled.get(definition);
  if (found === undefined) throw new Error("Form definition must be created with defineForm");
  return found;
};
