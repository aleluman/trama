import { fieldAt, type FieldDefinition } from "./fields.js";
import type { StateProperty } from "./state-properties.js";
import type { Fields } from "./definition.js";
import type { Row, RowAddress } from "./address.js";
import type { CompiledCollection } from "./collections.js";
import { compileQuery, type CompiledQuery, type ParamsFormula } from "./params.js";
import { lock } from "./lock.js";
import { formSection } from "./scope-declarations.js";
import type { RuleFormula, RuleValues } from "./reads.js";
import { claim, type Claims, type Declaration } from "./declarations.js";

// A compiled formula of value, with the field it writes and the label of its
// diagnostics; undefined means no write. A rule of a collection compiles to a
// template, and each row to an instance of it, with its address and its label;
// both keep the order of the template, which decides precedence.
export type FieldFormula = {
  readonly address: string | RowAddress;
  readonly item: FieldDefinition;
  readonly label: string;
  readonly order: number;
  readonly formula: RuleFormula;
  // Only on the formulas a relation compiles: they also run when their
  // command wrote their field.
  readonly related?: true;
  readonly row: Row | undefined;
};
// A compiled event, stored under the field whose change runs it.
export type FieldEvent = {
  readonly edit: boolean;
  readonly address: string | RowAddress;
  readonly label: string;
  readonly order: number;
  readonly handler: (values: RuleValues, tools: object) => unknown;
  readonly row: Row | undefined;
};
// A compiled formula of state: a state property of some fields, which are the
// field of its entry or those an entry of the form lock reaches, also in the
// rows of each collection, or a states patch for several fields. The label
// prefixes its diagnostics. Formulas of state combine in the order of the
// compiled list. A message of a row, of a collection or of the form is a
// formula of state of no field, which says its scope.
export type Own = {
  readonly kind: "row" | "collection" | "form";
  readonly collection: string | undefined;
};
export type StateFormula = {
  readonly name?: string | undefined;
  readonly label: string;
  readonly formula: RuleFormula;
  readonly row: Row | undefined;
  readonly own?: Own | undefined;
} & (
  | {
      readonly kind: "property";
      readonly property: StateProperty;
      readonly names: readonly string[];
      readonly rows?: ReadonlyMap<string, readonly string[]> | undefined;
    }
  | { readonly kind: "states" }
);
// The template of a formula of state or of the params of a collection, which
// observes in its place for every row, in their creation order.
export type EachObserver = {
  readonly kind: "each";
  readonly collection: CompiledCollection;
  readonly template: StateFormula | ParamsFormula;
};
// The formulas that observe the resolved values, in declaration order:
// formulas of state and params, as the entries of rules list them, then the
// lock of the form.
export type Observer = StateFormula | ParamsFormula;
export const isState = (formula: { readonly kind: string }): formula is StateFormula =>
  formula.kind === "property" || formula.kind === "states";

// The declarations a form places: those of each rule set it includes, at its
// place in include, and its own rules, without one.
export type Source = {
  readonly place: string | undefined;
  readonly declarations: readonly Declaration[];
};

// The sources compile in order, as one sequence of declarations with one
// counter: formulas and events are kept as declared, so later changes to the
// author's objects do not reach the definition. Each field declares one value,
// one event, one params and one query in the whole sequence. Every formula runs
// at opening and when a value it read changes; formulas of state also run at
// restore. The lock of the form follows every source.
export const compileProperties = (
  fields: Fields,
  collections: ReadonlyMap<string, CompiledCollection>,
  sources: readonly Source[],
  form: unknown,
) => {
  const observers: (Observer | EachObserver)[] = [];
  const header: Target = {
    fields,
    formulas: new Map(),
    events: new Map(),
    queries: new Map(),
    observe: (observer) => observers.push(observer),
    claimed: new Map(),
  };
  const targets = new Map<string, Target>();
  for (const [name, collection] of collections) targets.set(name, rowTarget(collection, observers));
  let order = 0;
  const next = () => ++order;
  for (const { place, declarations } of sources) {
    const suffix = place === undefined ? "" : ` (${place})`;
    for (const declaration of declarations) {
      const target =
        declaration.collection === undefined
          ? header
          : (targets.get(declaration.collection) as Target);
      claim(target.claimed, declaration, place ?? "rules");
      compileDeclaration(target, declaration, suffix, next);
    }
  }
  const section = formSection(form);
  const locks = lock(fields, collections, section.readOnly);
  observers.push(...locks);
  for (const declaration of section.own) compileDeclaration(header, declaration, "", next);
  const states = observers.filter((observer): observer is StateFormula => isState(observer));
  return {
    hasEdits: declares(sources, "onEdit"),
    hasRelations: declares(sources, "relation"),
    formulas: header.formulas as ReadonlyMap<string, FieldFormula>,
    events: header.events as ReadonlyMap<string, FieldEvent>,
    observers: Object.freeze(observers),
    states: Object.freeze(states.filter((formula) => formula.own === undefined)),
    own: Object.freeze(states.filter((formula) => formula.own !== undefined)),
    locks: Object.freeze(locks),
    queries: header.queries as ReadonlyMap<string, CompiledQuery>,
  };
};
// Whether a source declares the property: a form without onEdit captures no
// direct edits, and one without relation runs its formulas as ever.
const declares = (sources: readonly Source[], property: Declaration["property"]) =>
  sources.some(({ declarations }) =>
    declarations.some((declared) => declared.property === property),
  );

// Where the declarations of the header, or of the rows of a collection,
// compile: the rules of rows compile to templates that observe in the place
// of their declaration for every row, in their creation order. claimed keeps
// the property and the place of each property taken once, by property and
// field; onChange and onEdit share the key of the event of their field.
type Target = {
  readonly fields: Fields;
  readonly formulas: Map<string, FieldFormula>;
  readonly events: Map<string, FieldEvent>;
  readonly queries: Map<string, CompiledQuery>;
  readonly observe: (observer: StateFormula | ParamsFormula) => void;
  readonly claimed: Claims;
};
const rowTarget = (
  collection: CompiledCollection,
  observers: (Observer | EachObserver)[],
): Target => ({
  fields: collection.fields,
  formulas: collection.formulas,
  events: collection.events,
  queries: collection.queries,
  observe: (template) => {
    if (!isState(template)) collection.params.push(template);
    else if (template.own === undefined) collection.states.push(template);
    else collection.own.push(template);
    observers.push(Object.freeze({ kind: "each", collection, template }));
  },
  claimed: new Map(),
});

// A declaration compiles with the definition of its field in the form, and
// every label it gives ends with the place of its rule set.
const compileDeclaration = (
  target: Target,
  declaration: Declaration,
  place: string,
  next: () => number,
) => {
  const { name, label: prefix, property, drivenBy } = declaration;
  if (declaration.property === "relation") return;
  if (declaration.property === "query") {
    const compiled = compileQuery(name, prefix, declaration.query, target.queries.size, place);
    target.queries.set(name, compiled.query);
    if (compiled.params !== undefined) target.observe(compiled.params);
    return;
  }
  const { formulas } = declaration;
  const relation = drivenBy === undefined ? "" : ` (relation of "${drivenBy}")`;
  const labelOf = (suffix: string) => `${prefix} ${property}${suffix}${relation}${place}`;
  if (
    property === "params" ||
    property === "value" ||
    property === "onChange" ||
    property === "onEdit"
  ) {
    const [[, formula]] = formulas as [[string, RuleFormula]];
    compileOne(target, name, property, formula, labelOf(""), next, drivenBy !== undefined);
    return;
  }
  const { own } = declaration;
  const names = own === undefined ? [name] : [];
  for (const [suffix, formula] of formulas)
    target.observe(
      property === "states"
        ? Object.freeze({ kind: "states", name, label: labelOf(suffix), formula, row: undefined })
        : Object.freeze({
            kind: "property",
            property: property as StateProperty,
            names,
            ...(own === undefined ? { name } : { own }),
            label: labelOf(suffix),
            formula,
            row: undefined,
          }),
    );
};
// The params of an async field, its formula of value or its event, which
// takes the next place among the writers of the form.
const compileOne = (
  target: Target,
  name: string,
  property: "params" | "value" | "onChange" | "onEdit",
  formula: RuleFormula,
  label: string,
  next: () => number,
  related: boolean,
) => {
  if (property === "params")
    target.observe(
      Object.freeze({ kind: "params", name, address: name, label, formula, row: undefined }),
    );
  else if (property === "value") {
    const item = fieldAt(target.fields, name) as FieldDefinition;
    const compiled = {
      address: name,
      item,
      label,
      order: next(),
      formula,
      row: undefined,
      ...(related ? { related: true as const } : {}),
    };
    target.formulas.set(name, Object.freeze(compiled));
  } else {
    const handler = formula as FieldEvent["handler"];
    const compiled = {
      address: name,
      label,
      order: next(),
      handler,
      row: undefined,
      edit: property === "onEdit",
    };
    target.events.set(name, Object.freeze(compiled));
  }
};
