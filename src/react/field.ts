import { useId, useMemo, useSyncExternalStore } from "react";
import { showsErrors, visibleErrors, type ShowErrors } from "./visible-messages.js";
import type {
  FieldDefinition,
  FormDefinition,
  Option,
  OptionList,
  RowHandle,
  Session,
  Snapshot,
} from "../core/index.js";
import { sessionKey } from "./outputs.js";

// What a Field renders from: a session or the handle of a row. Both give the
// definitions of their fields, a subscription, a snapshot whose values and
// states a Field selects by name in O(1), with whether its scope was
// attempted, an edit, a touch, a controller of input for each view and a new
// option list for each view of an async field; a row that no longer exists
// has no snapshot.
export type FieldSource = {
  readonly fields: Readonly<Record<string, FieldDefinition>>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SourceSnapshot | undefined;
  readonly attempted: (snapshot: SourceSnapshot) => boolean;
  readonly edit: (name: string, value: unknown) => void;
  readonly touch: (name: string) => void;
  readonly input: (name: string) => InputView;
  readonly list: (name: string) => OptionList<Option>;
  // The definition of a session, whose renderers cover its collections too;
  // rows have none, and name their collection.
  readonly definition: FormDefinition | undefined;
  readonly collection: string | undefined;
  // What identifies the source, so that renderers of another source remount.
  readonly owner: object;
};
// The state of any field, with a placeholder when its definition declares one,
// and the limits of its type that some contribution gives.
export type AnyState = {
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
  readonly placeholder?: string | undefined;
  readonly decimals?: number;
  readonly min?: number | string;
  readonly max?: number | string;
};
type SourceSnapshot = {
  readonly values: Readonly<Record<string, unknown>>;
  readonly fieldStates: Readonly<Record<string, unknown>>;
  readonly resetVersion: number;
};
// The controller of the pending input of one view.
type InputView = ReturnType<Session<FormDefinition>["input"]>;
// What a Field selects: its value, its state, the reset version and the errors
// its binding shows.
export type Selection = {
  readonly value: unknown;
  readonly state: AnyState;
  readonly resetVersion: number;
  readonly errors: readonly string[];
};

const sessions = new WeakMap<object, FieldSource>();
export const sessionSource = (session: Session<FormDefinition>): FieldSource => {
  let source = sessions.get(session);
  if (source === undefined) {
    source = {
      fields: session.definition.fields,
      subscribe: session.subscribe,
      snapshot: () => session.getSnapshot() as Snapshot<FormDefinition>,
      attempted: (snapshot) => (snapshot as Snapshot<FormDefinition>).form.attempted,
      edit: (name, value) => {
        (session.edit as (name: string, value: unknown) => void)(name, value);
      },
      touch: (name) => session.touch(name),
      input: (name) => session.input(name),
      // A wide definition has no async fields in types, so the lookup is cast.
      list: (name) => (session.list as unknown as (name: string) => OptionList<Option>)(name),
      definition: session.definition,
      collection: undefined,
      owner: session,
    };
    sessions.set(session, source);
  }
  return source;
};
// The source of the props of a Field: its row, or else its session.
export const sourceOf = (props: object) => {
  const { session, row } = props as {
    readonly session?: Session<FormDefinition> | undefined;
    readonly row?: RowHandle | undefined;
  };
  return row === undefined ? sessionSource(session as Session<FormDefinition>) : rowSource(row);
};
const rows = new WeakMap<object, FieldSource>();
export const rowSource = (row: RowHandle): FieldSource => {
  let source = rows.get(row);
  if (source === undefined) {
    source = {
      fields: row.fields,
      subscribe: row.subscribe,
      snapshot: row.getSnapshot,
      attempted: (snapshot) =>
        (snapshot as NonNullable<ReturnType<RowHandle["getSnapshot"]>>).attempted,
      edit: (name, value) => {
        (row.edit as (name: string, value: unknown) => void)(name, value);
      },
      touch: (name) => row.touch(name),
      input: (name) => row.input(name),
      list: (name) => (row.list as unknown as (name: string) => OptionList<Option>)(name),
      definition: undefined,
      collection: row.collection,
      owner: row,
    };
    rows.set(row, source);
  }
  return source;
};

// The view of one field of a source, the same while the Field keeps its
// source, name and policy.
// - Its selection keeps its object while the value, the state object, the
//   reset version and the errors shown do not change: an attempt renders
//   again only the fields whose errors it reveals.
// - Its commands: the source accepts every edit, and the binding ignores one
//   from the renderer while the field is disabled or read-only.
const viewOf = (source: FieldSource, name: string, policy: ShowErrors) => {
  let selected: Selection | undefined;
  let attempted = false;
  const { subscribe, report } = pendingInput(source, name);
  return {
    subscribe,
    select: () => {
      const snapshot = source.snapshot();
      if (snapshot === undefined) return (selected = undefined);
      const value = snapshot.values[name];
      const state = snapshot.fieldStates[name] as AnyState;
      const { resetVersion } = snapshot;
      const scope = source.attempted(snapshot);
      const held = selected;
      const same =
        held !== undefined &&
        Object.is(held.value, value) &&
        held.state === state &&
        held.resetVersion === resetVersion;
      if (same && attempted === scope) return held;
      attempted = scope;
      const errors = visibleErrors(state, showsErrors(policy, state.touched, scope), held?.errors);
      if (same && held.errors === errors) return held;
      return (selected = { value, state, resetVersion, errors });
    },
    report,
    edit: (next: unknown) => {
      const state = source.snapshot()?.fieldStates[name] as AnyState | undefined;
      if (state === undefined || state.disabled || state.readOnly) return;
      source.edit(name, next);
    },
    touch: () => source.touch(name),
  };
};

// The controller of the pending input of a view: it lives while its renderer
// is mounted. It is created at the first message, in a callback and never
// while rendering, and a reset leaves it behind. The subscription of React
// disposes it when the Field unmounts or changes view; a renderer that
// reports from its mount effect does it before the Field subscribes, and in
// StrictMode, between the two subscriptions. A field that hides unmounts its
// renderer and its text, and a message can arrive once the Field left: then,
// after that commit, the controller goes. The session takes no report during
// its notification, so it goes in a microtask.
const pendingInput = (source: FieldSource, name: string) => {
  let input: { readonly view: InputView; readonly resetVersion: number } | undefined;
  let ended = false;
  const release = () => {
    input?.view.dispose();
    input = undefined;
  };
  const shown = () => {
    const snapshot = source.snapshot();
    return snapshot !== undefined && !(snapshot.fieldStates[name] as AnyState).hidden;
  };
  const settle = () => {
    queueMicrotask(() => {
      if (input !== undefined && (ended || !shown())) release();
    });
  };
  return {
    subscribe: (listener: () => void) => {
      ended = false;
      const stop = source.subscribe(() => {
        listener();
        if (input !== undefined && !shown()) settle();
      });
      return () => {
        stop();
        ended = true;
        release();
      };
    },
    report: (message?: string) => {
      const resetVersion = source.snapshot()?.resetVersion;
      if (input !== undefined && input.resetVersion !== resetVersion) input = undefined;
      if (input === undefined) {
        if (message === undefined || resetVersion === undefined) return;
        input = { view: source.input(name), resetVersion };
      }
      input.view.error(message);
      if (ended || !shown()) settle();
    },
  };
};

// A hidden field stays subscribed, so it appears again. The key of its
// renderer names its source and its field.
export const useField = (source: FieldSource, name: string, policy: ShowErrors) => {
  const id = useId();
  const view = useMemo(() => viewOf(source, name, policy), [source, name, policy]);
  const selection = useSyncExternalStore(view.subscribe, view.select);
  return { id, selection, view, key: `${sessionKey(source.owner)}:${name}` };
};
