import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryObserver } from "@tanstack/react-query";
import { act, flush } from "./helpers/react.mjs";
import { setup } from "./helpers/query.mjs";

test("With real TanStack Query, new→A→B preserves the screen and discards stale responses and retry calls", async () => {
  const app = await setup({ props: { isNew: true, query: { enabled: false } } });
  try {
    assert.equal(app.editor.status, "ready");
    await act(() => {
      app.view.container.querySelector("button").click();
    });
    await app.view.render({ id: "A" });
    assert.equal(app.editor.status, "loading");
    await act(() => {
      app.requests[0].reject(new Error("A failed"));
    });
    await flush();
    const oldRetry = app.editor.retry;
    await act(() => {
      oldRetry();
    });
    await app.view.render({ id: "B" });
    await act(() => {
      app.requests.at(-1).resolve({ title: "B" });
    });
    await flush();
    await act(() => {
      app.requests[1].resolve({ title: "Late A" });
      oldRetry();
    });
    await flush();
    assert.equal(app.editor.session.getSnapshot().values.title, "B");
    assert.equal(app.view.container.querySelector("button").textContent, "1");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, StrictMode effect replay reaches ready and unmount ignores late responses", async () => {
  const app = await setup({ strict: true });
  try {
    await act(() => {
      for (const request of app.requests) request.resolve({ title: "Strict" });
    });
    await flush();
    assert.equal(app.editor.status, "ready");
    assert.equal(app.editor.session.getSnapshot().values.title, "Strict");
    assert.ok(app.requests.length <= 2, "No fetch loops");
  } finally {
    await app.close();
  }
  const late = await setup();
  await late.close();
  await act(() => {
    late.requests[0].resolve({ title: "After unmount" });
  });
  await flush();
  assert.equal(late.editor.status, "loading");
});

test("With real TanStack Query, disabling during a refresh keeps loading until re-enabled", async () => {
  const app = await setup();
  try {
    await app.view.render({ query: { enabled: false } });
    await act(() => {
      app.requests[0].resolve({ title: "Arrived while disabled" });
    });
    await flush();
    assert.equal(app.editor.status, "loading");
    await app.view.render({ query: { enabled: true, staleTime: Infinity } });
    assert.equal(app.editor.status, "ready");
    assert.equal(app.editor.session.getSnapshot().values.title, "Arrived while disabled");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, unmounting the editor does not cancel a query shared by another observer", async () => {
  const app = await setup();
  const observer = new QueryObserver(app.client, { queryKey: ["task"], enabled: false });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await app.view.unmount();
    assert.equal(app.requests[0].signal.aborted, false);
    await act(() => {
      app.requests[0].resolve({ title: "Shared result" });
    });
    await flush();
    assert.equal(observer.getCurrentResult().data.title, "Shared result");
    assert.equal(app.editor.status, "loading");
  } finally {
    unsubscribe();
    app.client.clear();
  }
});
