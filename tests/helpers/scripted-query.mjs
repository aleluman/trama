import { Activity, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { act, createElement, deferred } from "./react.mjs";

// A second adapter of InitialQuery, besides TanStack Query: the test publishes
// each result and settles each refetch itself, so no step waits for time.
const definition = defineForm({ fields: { title: field.text() } });
const { useFormSession } = createReactBinding({ text: () => null });

const empty = {
  data: undefined,
  error: null,
  status: "pending",
  isEnabled: true,
  isStale: true,
  isPlaceholderData: false,
  dataUpdatedAt: 0,
};

export function scriptedQuery(state = {}) {
  const listeners = new Set();
  const refetches = [];
  const result = (patch) => ({ ...empty, ...patch, refetch });
  function refetch(options) {
    const { promise, resolve, reject } = deferred();
    refetches.push({ options, resolve: (patch) => resolve(result(patch)), reject });
    return promise;
  }
  let current = result(state);
  return {
    refetches,
    get current() {
      return current;
    },
    // Publishes a new result, as the TanStack Query observer does.
    set(patch) {
      current = { ...current, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export async function openEditor(source) {
  let editor;
  let mode = "visible";
  // Plain values that replace the query as initial, under the same key.
  let values;
  function Editor(props) {
    const query = useSyncExternalStore(source.subscribe, () => source.current);
    const current = useFormSession(definition, {
      initial: props.values ?? initialFromQuery(query),
    });
    useLayoutEffect(() => {
      editor = current;
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = () => {
    root.render(createElement(Activity, { mode }, createElement(Editor, { values })));
  };
  await act(render);
  return {
    get editor() {
      return editor;
    },
    // An async act collects updates until a later task, after the continuations
    // of the refetches the step settled; a sync act stops collecting at once.
    async step(run) {
      // oxlint-disable-next-line require-await -- Only an async callback takes that path.
      await act(async () => {
        run();
      });
    },
    async hide(hidden) {
      mode = hidden ? "hidden" : "visible";
      await act(render);
    },
    // Renders the editor again with plain values as initial instead of the query.
    async initial(next) {
      values = next;
      await act(render);
    },
    async unmount() {
      await act(() => {
        root.unmount();
      });
    },
  };
}
