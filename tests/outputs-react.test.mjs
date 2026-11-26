import assert from "node:assert/strict";
import { test } from "node:test";
import { Component, StrictMode, Suspense, startTransition, useLayoutEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery, useOutputs } from "trama-forms/react";
import { act, createElement as h, deferred, flush, mount } from "./helpers/react.mjs";
import { createQueryClient } from "./helpers/query.mjs";

const definition = defineForm({
  fields: { amount: field.number({ default: 2 }), title: field.text() },
  outputs: ({ output }) => {
    const amount = output((values) => ({ doubled: (values.amount ?? 0) * 2 }));
    const title = output((values) => values.title);
    return { amount, title };
  },
});

test("useOutputs tracks conditional reads, spread, and rest across StrictMode replay and session changes, and stops observing on unmount", async () => {
  const first = createSession(definition);
  const second = createSession(definition, { initial: { title: "Second", amount: 9 } });
  const commits = [];
  const view = await mount(
    ({ session, mode, visible = true }) =>
      h(StrictMode, null, visible && h(ModeSummary, { session, mode, commits })),
    { session: first, mode: "title" },
  );
  try {
    let before = commits.length;
    await act(() => first.edit("amount", 3));
    assert.equal(commits.length, before);
    await view.render({ session: first, mode: "amount" });
    before = commits.length;
    await act(() => first.edit("title", "Unselected"));
    assert.equal(commits.length, before);
    await view.render({ session: first, mode: "spread" });
    await act(() => first.edit("title", "Spread"));
    assert.match(view.container.textContent, /Spread/u);
    await view.render({ session: first, mode: "rest" });
    await act(() => first.edit("title", "Rest"));
    assert.match(view.container.textContent, /Rest/u);
    await view.render({ session: second, mode: "title" });
    before = commits.length;
    await act(() => first.edit("title", "Old session"));
    assert.equal(commits.length, before);
    assert.equal(view.container.textContent, "Second");
    await act(() => second.edit("title", "New session"));
    assert.equal(view.container.textContent, "New session");
    await view.render({ session: second, mode: "title", visible: false });
    before = commits.length;
    await act(() => second.edit("title", "Removed"));
    assert.equal(commits.length, before);
  } finally {
    await view.unmount();
  }
});

test("React checks for changes between render and subscription, and a suspended render does not replace current reads", async () => {
  const session = createSession(definition);
  const pending = deferred();
  const commits = [];
  let rerender;
  function Summary({ suspended = false }) {
    const outputs = useOutputs(session);
    const text = suspended ? outputs.title : outputs.amount.doubled;
    useLayoutEffect(() => {
      commits.push(text);
    });
    if (suspended) throw pending.promise;
    return h("output", null, text);
  }
  function EditBeforeSubscribe() {
    useLayoutEffect(() => {
      session.edit("amount", 3);
    }, []);
    return null;
  }
  function App() {
    const [suspended, setSuspended] = useState(false);
    useLayoutEffect(() => {
      rerender = () => startTransition(() => setSuspended(true));
    });
    return h(Suspense, { fallback: "Waiting" }, h(EditBeforeSubscribe), h(Summary, { suspended }));
  }
  const view = await mount(App);
  try {
    assert.equal(view.container.textContent, "6");
    await act(() => rerender());
    assert.equal(view.container.textContent, "6");
    const before = commits.length;
    await act(() => session.edit("title", "Uncommitted selection"));
    assert.equal(commits.length, before);
    await act(() => session.edit("amount", 4));
    assert.equal(view.container.textContent, "8");
  } finally {
    await view.unmount();
  }
});

test("TanStack Query exposes prepared outputs before readiness; a failed read throws to the application's error boundary", async () => {
  const { view, client, request, caught, failure, getEditor } = await mountQueryOutputs();
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(getEditor().status, "loading");
    await act(() => request.resolve({ amount: 17 }));
    await flush();
    assert.equal(getEditor().status, "ready");
    assert.match(view.container.textContent, /17Application fallback/u);
    assert.equal(caught[0].cause, failure);
    assert.match(caught[0].message, /bad/u);
    await act(() => getEditor().session.edit("amount", 23));
    assert.match(view.container.textContent, /23Application fallback/u);
    await view.render({ recovery: 1 });
    assert.equal(view.container.textContent, "2323");
    await act(() => getEditor().session.reset());
    assert.match(view.container.textContent, /17Application fallback/u);
  } finally {
    console.error = original;
    await view.unmount();
    client.clear();
  }
});

test("a component that destructures useOutputs rerenders only when a selected output changes", async () => {
  const session = createSession(definition);
  const commits = [];
  function Summary() {
    const { amount } = useOutputs(session);
    useLayoutEffect(() => {
      commits.push(amount);
    });
    return h("output", null, amount.doubled);
  }
  const view = await mount(Summary);
  try {
    assert.equal(view.container.textContent, "4");
    const initial = commits.length;
    await act(() => session.edit("title", "Unobserved"));
    assert.equal(commits.length, initial);
    await act(() => session.edit("amount", 0));
    assert.equal(view.container.textContent, "0");
    const beforeEqual = commits.length;
    await act(() => session.edit("amount", null));
    assert.equal(commits.length, beforeEqual);
    await act(() => session.reset());
    assert.equal(view.container.textContent, "4");
  } finally {
    await view.unmount();
  }
});

function ModeSummary({ session, mode, commits }) {
  const outputs = useOutputs(session);
  let text;
  if (mode === "spread") text = JSON.stringify({ ...outputs });
  else if (mode === "rest") {
    const { amount, ...rest } = outputs;
    text = JSON.stringify([amount, rest]);
  } else text = mode === "title" ? outputs.title : outputs.amount.doubled;
  useLayoutEffect(() => {
    commits.push(text);
  });
  return h("output", null, text);
}

function queryForm(failure) {
  return defineForm({
    fields: { amount: field.number() },
    rules: { amount: { value: () => 20 } },
    outputs: ({ output }) => ({
      safe: output((values) => values.amount),
      bad: output((values) => {
        if (values.amount === 17) throw failure;
        return values.amount;
      }),
    }),
  });
}

class ApplicationBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.caught.push(error);
  }
  render() {
    return this.state.error ? h("aside", null, "Application fallback") : this.props.children;
  }
}
function NamedSummary({ session, name }) {
  const outputs = useOutputs(session);
  return h("output", null, outputs[name]);
}

async function mountQueryOutputs() {
  const failure = new Error("Unavailable calculation");
  const form = queryForm(failure);
  const client = createQueryClient();
  const request = deferred();
  const { useFormSession } = createReactBinding({ number: () => null });
  let editor;
  const caught = [];
  function Editor({ recovery }) {
    const query = useQuery({
      queryKey: ["outputs"],
      queryFn: () => request.promise,
      staleTime: Infinity,
    });
    const current = useFormSession(form, { initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = current;
    });
    if (current.status !== "ready") return current.status;
    return h(
      "div",
      null,
      h(NamedSummary, { session: current.session, name: "safe" }),
      h(
        ApplicationBoundary,
        { key: recovery, caught },
        h(NamedSummary, { session: current.session, name: "bad" }),
      ),
    );
  }
  const view = await mount(({ recovery = 0 }) =>
    h(QueryClientProvider, { client }, h(Editor, { recovery })),
  );
  return { view, client, request, caught, failure, getEditor: () => editor };
}
