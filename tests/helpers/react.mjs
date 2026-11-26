import { JSDOM } from "jsdom";
import { act, createElement, StrictMode, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { createReactBinding } from "trama-forms/react";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export { act, createElement };

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export async function flush() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  });
}

// With strict, StrictMode wraps the root, so React runs the effects twice as it
// mounts; inside the component it would repeat only the render.
export async function mount(Component, props = {}, { strict = false } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next) => {
    const element = createElement(Component, next);
    await act(() => {
      root.render(strict ? createElement(StrictMode, null, element) : element);
    });
    await flush();
  };
  await render(props);
  return {
    container,
    render,
    async unmount() {
      await act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

// A renderer that records the props it committed, by name and row.
export const recording = (renders) =>
  function Input(props) {
    useLayoutEffect(() => {
      renders.push(props);
    });
    return createElement("input", {
      name: props.name,
      value: String(props.value ?? ""),
      onBlur: props.onBlur,
      onInput: (event) => props.onChange(event.currentTarget.value),
    });
  };
export const bindingOf = (renders, options) =>
  createReactBinding({ text: recording(renders), number: recording(renders) }, options);
export const last = (renders, name) => renders.findLast((props) => props.name === name);

// A component that records each state its hook gives.
export const recorder = (useFormState, states, args) =>
  function Probe() {
    const state = useFormState(...args());
    useLayoutEffect(() => {
      states.push(state);
    });
    return null;
  };
