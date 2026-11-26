import { fieldAt, hasPlaceholder, type FieldDefinition, type WithPlaceholder } from "./fields.js";
import type { DateDefinition, NumberDefinition } from "./field-definitions.js";
import type { Fields, FieldsIn, FormDefinition } from "./definition.js";
import { fieldLabel, type Row } from "./address.js";
import type { RowStates } from "./row-types.js";
import { defineOwn, sameItems } from "./data.js";
import type { StateFormula } from "./rules.js";
import {
  checkLimits,
  contributionOf,
  isLimit,
  isStateProperty,
  stateKinds,
  unlimited,
  type Contributed,
  type StateProperty,
} from "./state-properties.js";

// What a field publishes of every type: its flags, reasons and messages, with
// those of validation and of the views with pending input among its errors,
// the errors its sources give it from outside the rules, apart, whether its
// value differs from the baseline, and whether the person touched it.
// Contributions combine all of it but the external errors, dirty and touched,
// which a combined state has empty and false.
type Flags = {
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly hidden: boolean;
  readonly required: boolean;
  readonly label: string | undefined;
  readonly reasons: readonly string[];
  readonly errors: readonly string[];
  readonly externalErrors: readonly string[];
  readonly warnings: readonly string[];
  readonly dirty: boolean;
  readonly touched: boolean;
};
type TextState = Flags & { readonly placeholder: string | undefined };
// A limit is published only while some contribution gives it.
type NumberState = TextState & {
  readonly decimals?: number;
  readonly min?: number;
  readonly max?: number;
};
type DateState = TextState & { readonly min?: string; readonly max?: string };
// The state a field publishes: a placeholder when its definition declares one,
// and the limits of its type. Mapped in place, a diagnostic shows its members.
export type FieldState<D extends FieldDefinition> = D extends NumberDefinition
  ? { readonly [K in keyof NumberState]: NumberState[K] }
  : D extends DateDefinition
    ? { readonly [K in keyof DateState]: DateState[K] }
    : D extends WithPlaceholder
      ? { readonly [K in keyof TextState]: TextState[K] }
      : Flags;
type Flat<T> = { readonly [K in keyof T]: T[K] };
export type FieldStates<D extends FormDefinition> = Flat<
  { readonly [K in keyof D["fields"]]: FieldState<D["fields"][K]> } & {
    readonly [N in keyof D["collections"]]: readonly RowStates<FieldsIn<D["collections"][N]>>[];
  }
>;
type State = Flags & {
  readonly placeholder?: string | undefined;
  readonly decimals?: number;
  readonly min?: number | string;
  readonly max?: number | string;
};
export type States = Readonly<Record<string, State>>;
// What an active formula of state contributes: true or a reason for a flag, a
// text for label and placeholder, a value or unlimited for a limit, or what a
// states patch sets per field.
export type Contribution =
  | Contributed
  | readonly (readonly [name: string, property: StateProperty, value: Contributed])[];
// The contributions in force, which an operation reads before it applies them.
export type Contributions = Pick<ReadonlyMap<StateFormula, Contribution>, "get">;

// A draft keeps the frozen lists it started with until a contribution adds to one.
// The message of required, when a contribution gives one, stays out of the
// state, so a valid and clean state can be published as it is: validation
// reads it with requiredMessageOf.
type Draft = { -readonly [K in keyof State]: State[K] } & { requiredMessage?: string };
const requiredMessages = new WeakMap<State, string>();
export const requiredMessageOf = (state: State | Draft): string | undefined =>
  "requiredMessage" in state ? state.requiredMessage : requiredMessages.get(state);
const none: readonly string[] = Object.freeze([]);

// The state each field declares: its true flags, the reasons of disabled and
// readOnly in the order the field lists them, its label and placeholder, and
// its limits. Contributions start from it, and no rule withdraws it.
export const declaredStates = (fields: Fields): States =>
  Object.fromEntries(
    Object.entries(fields).map(([name, item]) => {
      const draft: Draft = {
        disabled: false,
        readOnly: false,
        hidden: false,
        required: false,
        label: item.label,
        ...(hasPlaceholder(item) ? { placeholder: item.placeholder } : {}),
        reasons: none,
        errors: none,
        externalErrors: none,
        warnings: none,
        dirty: false,
        touched: false,
      };
      // Definitions only keep values that their field accepted.
      for (const [key, value] of Object.entries(item)) {
        if (!isStateProperty(key) || stateKinds[key] === "message") continue;
        const contribution = contributionOf(key, value, item.type);
        if (contribution !== undefined && contribution !== null) add(draft, key, contribution);
      }
      return [name, freeze(draft)];
    }),
  );

// Combines the declared state with the active contributions, in declaration
// order: the entries of rules, each states patch at the position of its entry,
// and then the lock. Flags are true if any contribution is; reasons and
// messages keep their first position; the last label, placeholder or limit
// prevails, and unlimited removes a limit; the message of required is that of
// the last contribution that gives one. A field whose state did not change keeps its object, and so
// do the states; a new state whose min exceeds its max rejects the operation.
// The scope is the form or the collection whose fields combine; shared holds
// the states that the lock gives every row, with the lock: a field that no
// formula of the row reaches takes its state from there, and the lock
// combines only into the others. row names the fields of a row.
export const combineStates = (
  scope: { readonly declared: States; readonly fields: Fields },
  formulas: readonly StateFormula[],
  contributions: Contributions,
  previous: States | undefined,
  reach = (formula: StateFormula & { readonly kind: "property" }) => formula.names,
  shared?: { readonly states: States; readonly formulas: readonly StateFormula[] },
  row?: Row,
): States => {
  const { declared } = scope;
  const drafts = new Map<string, Draft>();
  const draft = (name: string) => {
    let found = drafts.get(name);
    if (found === undefined) {
      const start = declared[name] as State;
      // Only a required state has a message.
      const message = start.required ? requiredMessages.get(start) : undefined;
      found = message === undefined ? { ...start } : { ...start, requiredMessage: message };
      drafts.set(name, found);
    }
    return found;
  };
  for (const formula of formulas) combine(formula, contributions, reach, draft);
  for (const formula of shared?.formulas ?? [])
    combine(formula, contributions, reach, (name) => drafts.get(name));
  let changed = false;
  const next: Record<string, State> = {};
  for (const [name, start] of entriesOf(declared)) {
    const before = previous?.[name];
    const drafted = drafts.get(name);
    const content = drafted ?? shared?.states[name] ?? start;
    const state =
      before !== undefined && same(before, content)
        ? before
        : drafted === undefined
          ? content
          : same(start, drafted)
            ? start
            : created(scope.fields, name, row, drafted, before);
    changed ||= state !== before;
    // Assigning __proto__ would set the prototype instead of the field.
    if (name === "__proto__") defineOwn(next, name, state);
    else next[name] = state;
  }
  return changed || previous === undefined ? Object.freeze(next) : previous;
};

// A state that contributions change, whose min must not exceed its max.
const created = (
  fields: Fields,
  name: string,
  row: Row | undefined,
  drafted: Draft,
  before: State | undefined,
) => {
  if (drafted.min !== undefined && drafted.max !== undefined)
    checkLimits(fieldLabel(name, row), (fieldAt(fields, name) as FieldDefinition).type, drafted);
  return freeze(drafted, before);
};

// The states a form or a collection declares, as entries, which every
// combination of their fields goes through.
const declaredEntries = new WeakMap<States, readonly (readonly [string, State])[]>();
const entriesOf = (declared: States) => {
  let found = declaredEntries.get(declared);
  if (found === undefined) {
    found = Object.entries(declared);
    declaredEntries.set(declared, found);
  }
  return found;
};

// Adds the contribution of a formula to the drafts of the fields it reaches;
// draft gives none for a field the formula must not reach.
const combine = (
  formula: StateFormula,
  contributions: Contributions,
  reach: (formula: StateFormula & { readonly kind: "property" }) => readonly string[],
  draft: (name: string) => Draft | undefined,
) => {
  const contribution = contributions.get(formula);
  if (contribution === undefined) return;
  if (typeof contribution === "object")
    for (const [name, property, value] of contribution) {
      const found = draft(name);
      if (found !== undefined) add(found, property, value);
    }
  else if (formula.kind === "property")
    for (const name of reach(formula)) {
      const found = draft(name);
      if (found !== undefined) add(found, formula.property, contribution);
    }
};

const add = (draft: Draft, property: StateProperty, value: Contributed) => {
  if (property === "label" || property === "placeholder") draft[property] = value as string;
  else if (isLimit(property)) {
    if (value === unlimited) delete draft[property];
    else (draft as Record<string, unknown>)[property] = value;
  } else if (property === "error" || property === "warning") {
    const list = property === "error" ? "errors" : "warnings";
    if (!draft[list].includes(value as string)) draft[list] = [...draft[list], value as string];
  } else {
    draft[property] = true;
    if (typeof value !== "string") return;
    if (property === "required") draft.requiredMessage = value;
    else if (!draft.reasons.includes(value)) draft.reasons = [...draft.reasons, value];
  }
};

const same = (a: State | Draft, b: State | Draft) =>
  a === b ||
  (a.disabled === b.disabled &&
    a.readOnly === b.readOnly &&
    a.hidden === b.hidden &&
    a.required === b.required &&
    a.label === b.label &&
    a.placeholder === b.placeholder &&
    a.decimals === b.decimals &&
    a.min === b.min &&
    a.max === b.max &&
    (!a.required || requiredMessageOf(a) === requiredMessageOf(b)) &&
    sameItems(a.reasons, b.reasons) &&
    sameItems(a.errors, b.errors) &&
    sameItems(a.warnings, b.warnings));

// A new state keeps the lists of the previous one that did not change, and
// leaves the message of required in its table.
const freeze = (draft: Draft, before?: State): State => {
  const { requiredMessage } = draft;
  const state = Object.freeze({
    ...(requiredMessage === undefined ? draft : withoutMessage(draft)),
    reasons: kept(draft.reasons, before?.reasons),
    errors: kept(draft.errors, before?.errors),
    warnings: kept(draft.warnings, before?.warnings),
  });
  if (requiredMessage !== undefined) requiredMessages.set(state, requiredMessage);
  return state;
};
const withoutMessage = (draft: Draft) => {
  const state: Partial<Draft> = { ...draft };
  delete state.requiredMessage;
  return state as Omit<Draft, "requiredMessage">;
};
const kept = (list: readonly string[], before: readonly string[] | undefined) =>
  before !== undefined && sameItems(before, list) ? before : Object.freeze(list);
