// An order with lines, a table and a modal that render its rows, and renderers
// that count what they commit, for the suites of rows in React.
import { Component, memo, useLayoutEffect } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, useRows } from "trama-forms/react";
import { act, createElement as h } from "./react.mjs";

export const order = defineForm({
  fields: { rate: field.number({ default: 1 }), total: field.number(), sent: field.checkbox() },
  collections: {
    lines: {
      fields: {
        product: field.text(),
        quantity: field.number({ default: 1 }),
        price: field.number(),
        amount: field.number(),
        lot: field.text(),
      },
    },
  },
  rules: {
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) },
    lines: {
      each: {
        amount: {
          value: ({ quantity, price }, { values }) =>
            (quantity ?? 0) * (price ?? 0) * (values.rate ?? 1),
        },
        price: { readOnly: ({ product }) => product === "Gift" && "Gift" },
        quantity: {
          states: ({ quantity }) => (quantity === 0 ? { lot: { hidden: true } } : undefined),
        },
      },
    },
  },
  form: {
    readOnly: { value: ({ sent }) => sent && "Sent", except: ["sent", { lines: ["lot"] }] },
  },
});
export const opened = (lines) => createSession(order, { initial: { lines } });
export const linesOf = (session) => session.getSnapshot().values.lines;

// A binding whose renderers are inputs that edit on input. They count their
// commits, their mounts and the ones mounted now, and keep the last onChange
// of each id.
export function instrumented() {
  const counts = { commits: 0, mounts: 0, live: 0 };
  const callbacks = new Map();
  const input = (parse) =>
    function Input({ id, name, value, readOnly, onChange }) {
      useLayoutEffect(() => {
        counts.commits += 1;
        callbacks.set(id, onChange);
      });
      useLayoutEffect(() => {
        counts.mounts += 1;
        counts.live += 1;
        return () => {
          counts.live -= 1;
        };
      }, []);
      return h("input", {
        id,
        name,
        value: String(value ?? ""),
        readOnly,
        onInput: (event) => onChange(parse(event.currentTarget.value)),
      });
    };
  const binding = createReactBinding({
    text: input(String),
    number: input(Number),
    checkbox: input(Boolean),
  });
  return { ...binding, counts, callbacks };
}

// Types text into an input, as the person would.
export const type = (input, text) =>
  act(() => {
    input.value = text;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
// The input of a field inside the element of a table row or a modal.
export const cell = (view, key, name) =>
  view.container.querySelector(`[data-key="${key}"] [name="${name}"]`);
export const shown = (view, key, names) => names.map((name) => cell(view, key, name).value);
// The keys of the table rows, in the order the document shows them.
export const visual = (view) =>
  [...view.container.querySelectorAll("tr")].map((row) => row.dataset.key);

// A table with one row per key, which records the keys it commits.
export function Table({ Field, session, names, commits }) {
  const keys = useRows(session, "lines");
  useLayoutEffect(() => {
    commits?.push(keys);
  });
  return h(
    "table",
    null,
    h(
      "tbody",
      null,
      keys.map((key) => h(Line, { key, Field, line: session.row("lines", key), names })),
    ),
  );
}
const Line = memo(function Line({ Field, line, names }) {
  return h(
    "tr",
    { "data-key": line.key },
    names.map((name) => h("td", { key: name }, h(Field, { row: line, name }))),
  );
});
// A modal that edits one row with its handle; its fields are under "modal-<key>".
export function Modal({ Field, line, names }) {
  return h(
    "dialog",
    { open: true, "data-key": `modal-${line.key}` },
    names.map((name) => h(Field, { key: name, row: line, name })),
  );
}

// Records what its subtree throws while rendering, instead of letting React rethrow it.
export class Boundary extends Component {
  state = { error: undefined };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.errors.push(error);
  }
  render() {
    return this.state.error === undefined ? this.props.children : null;
  }
}
