import assert from "node:assert/strict";
import { test } from "node:test";
import { Component, StrictMode, Suspense, startTransition, useLayoutEffect, useState } from "react";
import { createSession } from "trama-forms/core";
import { OutputBoundary, useOutputs } from "trama-forms/react";
import { form, mountQueryBoundary } from "./helpers/output-boundary.mjs";
import { act, createElement as h, deferred, flush, mount } from "./helpers/react.mjs";

test("a failure on the first render recovers without restarting TanStack Query or the session, even if another derived output still fails", async () => {
  const original = console.error;
  console.error = () => {};
  const { view, request, client, getEditor, getLoads, getAttempts } = await mountQueryBoundary();
  try {
    assert.equal(getEditor().status, "loading");
    await act(() => request.resolve({ amount: 0 }));
    await flush();
    assert.equal(getEditor().status, "ready");
    const session = getEditor().session;
    assert.equal(view.container.textContent, "EditSummary unavailable");
    const before = getAttempts();
    await act(() => session.edit("title", "Unrelated"));
    await act(() => session.edit("title", ""));
    assert.equal(getAttempts(), before, "unrelated changes do not retry children");
    await act(() => view.container.querySelector("button").click());
    assert.equal(view.container.textContent, "Edit4 units");
    assert.equal(getEditor().session, session);
    assert.equal(getLoads(), 1);
    const errors = [];
    session.watchOutputs(({ independent }) => independent, {
      onError: (error) => errors.push(error),
    })();
    assert.equal(errors.length, 1);
    assert.equal(session.getSnapshot().values.amount, 2);
    await act(() => session.reset());
    assert.equal(view.container.textContent, "EditSummary unavailable");
    assert.equal(getLoads(), 1);
  } finally {
    await view.unmount();
    console.error = original;
    client.clear();
  }
});

test("a visible component unmounts on output failure, recovers to the same successful result, and continues to respect output selection and equality", async () => {
  const session = createSession(form, { initial: { amount: 2 } });
  const commits = [];
  let attempts = 0;
  function Summary() {
    attempts++;
    const { caption } = useOutputs(session);
    const [local, setLocal] = useState(0);
    useLayoutEffect(() => {
      commits.push(caption);
    });
    return h("button", { onClick: () => setLocal(local + 1) }, `${caption}:${local}`);
  }
  const original = console.error;
  console.error = () => {};
  const view = await mount(() =>
    h(OutputBoundary, { session, fallback: "Unavailable" }, h(Summary)),
  );
  try {
    await act(() => view.container.querySelector("button").click());
    assert.equal(view.container.textContent, "4 units:1");
    const before = commits.length;
    await act(() => session.edit("title", "Outside selection"));
    await act(() => session.edit("amount", 2));
    assert.equal(commits.length, before);
    await act(() => session.edit("amount", 0));
    assert.equal(view.container.textContent, "Unavailable");
    const failedAttempts = attempts;
    await act(() => session.edit("amount", -1));
    await act(() => session.edit("title", ""));
    assert.equal(attempts, failedAttempts, "a new failure does not retry the children");
    await act(() => session.edit("amount", 2));
    assert.equal(view.container.textContent, "4 units:0", "retired child state is not retained");
    await act(() => session.edit("amount", 3));
    assert.equal(view.container.textContent, "6 units:0");
  } finally {
    await view.unmount();
    console.error = original;
  }
});

test("changing sessions during fallback, unmounting, and repeating effects do not mix recovery attempts", async () => {
  const first = createSession(form);
  const second = createSession(form);
  const ready = createSession(form, { initial: { amount: 7 } });
  const commits = [];
  function Summary({ session }) {
    const { caption } = useOutputs(session);
    useLayoutEffect(() => {
      commits.push(caption);
    });
    return caption;
  }
  const original = console.error;
  console.error = () => {};
  const view = await mount(
    ({ session, visible = true }) =>
      h(
        StrictMode,
        null,
        visible && h(OutputBoundary, { session, fallback: "Unavailable" }, h(Summary, { session })),
      ),
    { session: first },
  );
  try {
    assert.equal(view.container.textContent, "Unavailable");
    await view.render({ session: second });
    await act(() => first.edit("amount", 2));
    assert.equal(view.container.textContent, "Unavailable");
    assert.equal(commits.length, 0);
    await act(() => second.edit("amount", 3));
    assert.equal(view.container.textContent, "6 units");
    await act(() => second.edit("amount", 0));
    await view.render({ session: ready });
    assert.equal(view.container.textContent, "14 units");
    const before = commits.length;
    await act(() => second.edit("amount", 4));
    assert.equal(commits.length, before);
    await act(() => ready.edit("amount", 0));
    await view.render({ session: ready, visible: false });
    await act(() => ready.edit("amount", 8));
    assert.equal(commits.length, before);
    await view.render({ session: ready });
    assert.equal(view.container.textContent, "16 units");
  } finally {
    await view.unmount();
    console.error = original;
  }
});

for (const mode of ["ui", "foreign", "fallback"]) {
  test(`the ${mode} error reaches the application's usual error handling intact`, async () => {
    const session = createSession(form, { initial: { amount: 2 } });
    const foreign = createSession(form);
    const uiError = new Error('Output "caption": a UI error with a misleading message');
    let outputError;
    foreign.watchOutputs(({ caption }) => caption, {
      onError: (error) => {
        outputError = error;
      },
    })();
    const caught = [];
    function Summary() {
      const { caption } = useOutputs(mode === "ui" ? session : foreign);
      if (mode === "ui") throw uiError;
      return caption;
    }
    function BadFallback() {
      throw uiError;
    }
    const original = console.error;
    console.error = () => {};
    const view = await mount(() =>
      h(
        ApplicationBoundary,
        { caught },
        h(
          OutputBoundary,
          {
            session: mode === "fallback" ? foreign : session,
            fallback: mode === "fallback" ? h(BadFallback) : "Output fallback",
          },
          h(Summary),
        ),
      ),
    );
    try {
      assert.equal(view.container.textContent, "Application fallback");
      assert.equal(caught[0], mode === "foreign" ? outputError : uiError);
      await act(() => session.edit("amount", 3));
      assert.equal(view.container.textContent, "Application fallback");
      assert.equal(caught.length, 1);
    } finally {
      await view.unmount();
      console.error = original;
    }
  });
}

class ApplicationBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    this.props.caught.push(error);
  }
  render() {
    return this.state.failed ? "Application fallback" : this.props.children;
  }
}

test("recovery between render and subscription is retained, and a later read can fail", async () => {
  const session = createSession(form);
  const order = [];
  function Summary() {
    const { caption, independent } = useOutputs(session);
    return `${caption}: ${independent}`;
  }
  function Fallback() {
    useLayoutEffect(() => {
      order.push("fallback committed");
      // This runs before the fallback's output subscription is installed.
      session.edit("amount", 2);
    }, []);
    return "Unavailable";
  }
  const original = console.error;
  console.error = () => {};
  const view = await mount(() =>
    h(StrictMode, null, h(OutputBoundary, { session, fallback: h(Fallback) }, h(Summary))),
  );
  try {
    assert.equal(
      view.container.textContent,
      "Unavailable",
      "the second selected output is still failed",
    );
    assert.ok(order.length > 0);
    const before = order.length;
    await act(() => session.edit("amount", 3));
    assert.equal(order.length, before, "the first recovered output no longer owns recovery");
    await act(() => session.edit("title", "Ready"));
    assert.equal(view.container.textContent, "6 units: Ready");
  } finally {
    await view.unmount();
    console.error = original;
  }
});

test("a suspended render leaves the committed output selection and its recovery intact", async () => {
  const session = createSession(form, { initial: { amount: 2, title: "Ready" } });
  const pending = deferred();
  let suspend;
  let resume;
  const commits = [];
  function Summary({ suspended }) {
    const outputs = useOutputs(session);
    const text = suspended ? outputs.independent : outputs.caption;
    useLayoutEffect(() => {
      commits.push(text);
    });
    if (suspended) throw pending.promise;
    return text;
  }
  function App() {
    const [suspended, setSuspended] = useState(false);
    useLayoutEffect(() => {
      suspend = () => startTransition(() => setSuspended(true));
      resume = () => setSuspended(false);
    });
    return h(
      Suspense,
      { fallback: "Waiting" },
      h(OutputBoundary, { session, fallback: "Unavailable" }, h(Summary, { suspended })),
    );
  }
  const original = console.error;
  console.error = () => {};
  const view = await mount(App);
  try {
    assert.equal(view.container.textContent, "4 units");
    await act(() => suspend());
    assert.equal(view.container.textContent, "4 units");
    const before = commits.length;
    await act(() => session.edit("title", "Another uncommitted selection"));
    assert.equal(commits.length, before);
    await act(() => session.edit("amount", 0));
    // An external-store update can commit React's Suspense fallback.
    assert.equal(view.container.textContent, "Waiting");
    await act(() => resume());
    assert.equal(view.container.textContent, "Unavailable");
    await act(() => session.edit("title", ""));
    await act(() => session.edit("amount", 3));
    assert.equal(view.container.textContent, "6 units");
  } finally {
    await view.unmount();
    console.error = original;
  }
});
