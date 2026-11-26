// The state a field publishes: the one its contributions combine, with the
// result of its validation, whether it is dirty and its mark. A state is
// interned per session by its combined state, its result, dirty and touched,
// so the rows that share them share one object, and a message of the
// application runs once for each. A state with inputs or with externals,
// which are rare, is its own.
import { sameItems } from "./data.js";
import type { FieldDefinition } from "./field-definitions.js";
import { equalIn } from "./field-traits.js";
import { inputsOf, keptItems, merged, noInputs, type External, type Mark } from "./marks.js";
import type { Messages } from "./messages.js";
import type { States } from "./states.js";
import { sameChecks, valid, validationMessage, validationOf } from "./validation.js";

type State = States[string];
// What a published state comes from: its combined state, the result of its
// validation and its message, and the inputs and the external of its mark.
type Origin = {
  readonly raw: State;
  readonly result: number;
  readonly message: string | undefined;
  readonly inputs: readonly string[];
  readonly external: External | undefined;
};
export type Deriver = {
  // The state of raw with a result, dirty and a mark; the origin of the state
  // before gives its message when it validated alike.
  readonly state: (
    raw: State,
    type: FieldDefinition["type"],
    result: number,
    dirty: boolean,
    before: Origin | undefined,
    held: State | undefined,
    mark: Mark | undefined,
  ) => State;
  // What a published state derives from; undefined for a combined state,
  // published as it is.
  readonly origin: (published: State) => Origin | undefined;
  // The states of a scope derived from raw: the last ones derived, when they
  // hold the same objects, so rows alike share them. Those of a scope with
  // externals are not kept: the scope can go back to its combined states
  // without asking again, and the entry would keep messages that left.
  readonly scope: (
    raw: States,
    next: States,
    names: readonly string[],
    external: boolean,
  ) => States;
};

export const createDeriver = (messages: Messages): Deriver => {
  const interned = new WeakMap<State, Map<number, State>>();
  const origins = new WeakMap<State, Origin>();
  const scopes = new WeakMap<States, States>();
  return {
    scope: (raw, next, names, external) => {
      if (external) return Object.freeze(next);
      const last = scopes.get(raw);
      if (last !== undefined && names.every((name) => last[name] === next[name])) return last;
      const frozen = Object.freeze(next);
      scopes.set(raw, frozen);
      return frozen;
    },
    state: (raw, type, result, dirty, before, held, mark) => {
      // A valid, clean and unmarked state publishes as it combined.
      if (result === valid && !dirty && mark === undefined) return raw;
      const create = () => {
        const message =
          result === valid
            ? undefined
            : before !== undefined && alike(before, raw, result)
              ? before.message
              : validationMessage(messages, type, result, raw);
        const state = published(raw, message, dirty, held, mark);
        const external = mark?.external;
        origins.set(state, { raw, result, message, inputs: inputsOf(mark), external });
        return state;
      };
      if (inputsOf(mark) !== noInputs || mark?.external !== undefined) return create();
      let cache = interned.get(raw);
      if (cache === undefined) {
        cache = new Map();
        interned.set(raw, cache);
      }
      const key = result * 4 + Number(dirty) * 2 + Number(mark?.touched === true);
      let found = cache.get(key);
      if (found === undefined) cache.set(key, (found = create()));
      return found;
    },
    origin: (state) => origins.get(state),
  };
};

// Whether a state before validated as raw does, with the same result and label.
const alike = (before: Origin, raw: State, result: number) =>
  before.result === result && before.raw.label === raw.label && sameChecks(before.raw, raw);

// The combined state with the inputs of its views first, the message of
// validation before those of the rules, once, dirty and touched; and, with
// externals, their errors apart and their warnings after its own. Its lists
// keep those the field published while their items are the same.
const published = (
  raw: State,
  message: string | undefined,
  dirty: boolean,
  held: State | undefined,
  mark: Mark | undefined,
): State => {
  const own =
    message === undefined || raw.errors[0] === message
      ? raw.errors
      : [message, ...raw.errors.filter((error) => error !== message)];
  const inputs = inputsOf(mark);
  const errors = inputs === noInputs ? own : [...inputs, ...own];
  const state: { -readonly [K in keyof State]: State[K] } = {
    ...raw,
    errors: keptItems(errors, held?.errors),
    dirty,
    touched: mark?.touched ?? false,
  };
  const external = mark?.external;
  if (external !== undefined) {
    state.externalErrors = external.errors;
    state.warnings = keptItems(merged(raw.warnings, external.warnings), held?.warnings);
  }
  return Object.freeze(state);
};
// Whether two published states have the same content.
const samePublished = (a: State, b: State) => {
  if (a.dirty !== b.dirty || a.touched !== b.touched) return false;
  const keys = Object.keys(b) as (keyof State)[];
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every((key) => {
    const x = a[key];
    const y = b[key];
    return x === y || (Array.isArray(x) && Array.isArray(y) && sameItems(x, y));
  });
};

// Whether a state was derived with a mark: touched, and the same inputs and
// external.
const sameMark = (state: State, origin: Origin | undefined, mark: Mark | undefined) =>
  state.touched === (mark?.touched === true) &&
  (origin?.inputs ?? noInputs) === inputsOf(mark) &&
  origin?.external === mark?.external;

// One field: its type, its value and that of the baseline, absent in a row
// the baseline lacks, its combined state, the state it published, whether its
// value or its mark changed, and its mark. A field validates again only when
// its value changed or when its state changed what validation reads; dirty is
// compared again only when its value changed.
export const deriveField = (
  deriver: Deriver,
  type: FieldDefinition["type"],
  value: unknown,
  base: unknown,
  raw: State,
  held: State | undefined,
  changed: boolean,
  mark: Mark | undefined,
) => {
  const origin = held === undefined ? undefined : deriver.origin(held);
  const heldRaw = origin?.raw ?? held;
  // The state held stays while what it derives from does: its value, its
  // combined state and its mark, which a reset clears.
  if (!changed && heldRaw === raw && sameMark(held as State, origin, mark)) return held as State;
  const dirty = changed || held === undefined ? !equalIn(type, value, base) : held.dirty;
  const result =
    !changed && heldRaw !== undefined && sameChecks(heldRaw, raw)
      ? (origin?.result ?? valid)
      : validationOf(type, value, raw);
  const next = deriver.state(raw, type, result, dirty, origin, held, mark);
  // A state with the content the field published keeps its object: what
  // changed is only what validation reads and does not publish, as the
  // message of required.
  return held !== undefined && next !== held && samePublished(held, next) ? held : next;
};
