import type { DeepReadonly, OptionShape } from "./data.js";
import {
  requestOf,
  send,
  type Loader,
  type Page,
  type ResolvedEndpoint,
  type Scope,
} from "./endpoints.js";
import { wrapError } from "./fields.js";

// The option list of one view of an async field.
export type OptionListSnapshot<O> = {
  readonly status: "idle" | "suspended" | "loading" | "ready" | "error";
  // The search text in force; the action is search(text).
  readonly text: string;
  readonly options: readonly DeepReadonly<O>[];
  readonly complete: boolean;
  readonly error: Error | undefined;
};
export type OptionList<O> = {
  getSnapshot(): OptionListSnapshot<O>;
  subscribe(listener: () => void): () => void;
  open(): void;
  search(text: string): void;
  more(): void;
  retry(): void;
};

// What a view needs from its session: the label of its field, the params in
// force, undefined while they suspend, a way to hear about every publication,
// and how to notify its subscribers, as the session notifies its own.
export type ListSource = {
  readonly label: string;
  readonly endpoint: ResolvedEndpoint;
  readonly scope: Scope;
  readonly loader: Loader;
  params(): object | undefined;
  watch(listener: () => void): () => void;
  notify(listener: () => void): void;
};
type Snapshot = OptionListSnapshot<OptionShape>;
type Options = Snapshot["options"];
// A request in flight: a response of any other attempt is discarded.
type Attempt = { readonly controller: AbortController };
// A view requests the page after the last one it took; a list endpoint keeps
// its whole list, which it searches locally.
type View = {
  readonly source: ListSource;
  readonly listeners: Set<() => void>;
  params: object | undefined;
  snapshot: Snapshot;
  opened: boolean;
  taken: number;
  whole: Options | undefined;
  attempt: Attempt | undefined;
  stopWatching: (() => void) | undefined;
};

// The list belongs to its view and never writes to the session. Its actions
// change the view at any time, but only a view with subscribers requests
// pages and takes responses: it requests when its first subscriber comes, and
// its last one leaving drops the request in flight.
export const createOptionList = (source: ListSource): OptionList<OptionShape> => {
  const params = source.params();
  const view: View = {
    source,
    listeners: new Set(),
    params,
    snapshot: Object.freeze({
      status: params === undefined ? "suspended" : "idle",
      text: "",
      options: none,
      complete: false,
      error: undefined,
    }),
    opened: false,
    taken: 0,
    whole: undefined,
    attempt: undefined,
    stopWatching: undefined,
  };
  return {
    getSnapshot: () => view.snapshot,
    subscribe: (listener) => subscribe(view, listener),
    open: () => {
      view.opened = true;
      if (view.snapshot.status !== "suspended") restart(view);
    },
    search: (text) => search(view, text),
    more: () => {
      if (view.snapshot.status !== "ready" || view.snapshot.complete) return;
      publish(view, { status: "loading" });
      request(view);
    },
    retry: () => {
      if (view.snapshot.status !== "error") return;
      publish(view, { status: "loading", error: undefined });
      request(view);
    },
  };
};
const none: Options = Object.freeze([]);

const subscribe = (view: View, listener: () => void) => {
  view.listeners.add(listener);
  if (view.listeners.size === 1) {
    view.stopWatching = view.source.watch(() => sync(view));
    sync(view);
    request(view);
  }
  return () => {
    if (!view.listeners.delete(listener) || view.listeners.size > 0) return;
    view.stopWatching?.();
    view.stopWatching = undefined;
    drop(view);
  };
};

const search = (view: View, text: unknown) => {
  if (typeof text !== "string")
    throw new TypeError(`${view.source.label} list: search text must be a string`);
  view.opened = true;
  const { status } = view.snapshot;
  if (status === "suspended") publish(view, { text });
  else if (view.source.endpoint.kind === "options") restart(view, { text });
  // A whole list is searched locally, once it is loaded.
  else if (view.whole !== undefined) publish(view, { text, options: filter(view.whole, text) });
  else if (status === "loading") publish(view, { text });
  else restart(view, { text });
};

const publish = (view: View, change: Partial<Snapshot>) => {
  const next = { ...view.snapshot, ...change };
  const keys = Object.keys(next) as (keyof Snapshot)[];
  if (keys.every((key) => next[key] === view.snapshot[key])) return;
  view.snapshot = Object.freeze(next);
  for (const listener of Array.from(view.listeners)) view.source.notify(listener);
};
const drop = (view: View) => {
  view.attempt?.controller.abort();
  view.attempt = undefined;
};
// Drops the pages and the request in flight.
const reset = (view: View, change: Partial<Snapshot>) => {
  drop(view);
  view.taken = 0;
  view.whole = undefined;
  publish(view, { options: none, complete: false, error: undefined, ...change });
};
// Starts again from page 1.
const restart = (view: View, change: Partial<Snapshot> = {}) => {
  reset(view, { status: "loading", ...change });
  request(view);
};

const request = (view: View) => {
  const { source, snapshot, params } = view;
  if (view.listeners.size === 0 || snapshot.status !== "loading" || view.attempt !== undefined)
    return;
  if (params === undefined) return;
  const attempt: Attempt = { controller: new AbortController() };
  view.attempt = attempt;
  const asked = requestOf(source.endpoint, source.scope, params, snapshot.text, view.taken + 1);
  send(source.loader, asked, attempt.controller.signal).then(
    (result) => {
      if (view.attempt === attempt) take(view, result);
    },
    (error: unknown) => {
      if (view.attempt !== attempt) return;
      view.attempt = undefined;
      const failure = wrapError(`${source.label} list: request failed`, error);
      publish(view, { status: "error", error: failure });
    },
  );
};

const take = (view: View, result: unknown) => {
  view.attempt = undefined;
  if (view.source.endpoint.kind === "list") {
    view.whole = result as Options;
    publish(view, {
      status: "ready",
      options: filter(view.whole, view.snapshot.text),
      complete: true,
    });
    return;
  }
  const page = result as Page;
  const seen = new Set(view.snapshot.options.map((option) => option.value));
  const fresh = page.options.filter((option) => !seen.has(option.value));
  view.taken += 1;
  const options = Object.freeze([...view.snapshot.options, ...fresh]);
  publish(view, { status: "ready", options, complete: !page.more });
};

// Params equal as data keep their object, so a new object is a change.
const sync = (view: View) => {
  const next = view.source.params();
  if (next === view.params) return;
  view.params = next;
  if (next !== undefined && view.opened) restart(view);
  else reset(view, { status: next === undefined ? "suspended" : "idle" });
};

// A whole list shows the options whose label contains the text, ignoring case
// and accents. Options are frozen copies that views and caches share, so each
// label is folded once.
const folded = new WeakMap<object, string>();
const fold = (text: string) => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();
const foldedLabel = (option: DeepReadonly<OptionShape>) => {
  let label = folded.get(option);
  if (label === undefined) {
    label = fold(option.label);
    folded.set(option, label);
  }
  return label;
};
const filter = (options: Options, text: string) => {
  if (text === "") return options;
  const wanted = fold(text);
  return Object.freeze(options.filter((option) => foldedLabel(option).includes(wanted)));
};
