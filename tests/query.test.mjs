import assert from "node:assert/strict";
import { test } from "node:test";
import { onlineManager } from "@tanstack/react-query";
import { act, flush } from "./helpers/react.mjs";
import { definition, setup } from "./helpers/query.mjs";

test("With real TanStack Query, opening waits for a refresh when cached data is stale and uses the refreshed data as the baseline, even with zero staleTime", async () => {
  const app = await setup({ cached: { title: "Old" } });
  try {
    assert.equal(app.editor.status, "loading");
    await act(() => {
      app.requests[0].resolve({ title: "Fresh" });
    });
    await flush();
    assert.equal(app.editor.status, "ready");
    assert.deepEqual(app.editor.session.getSnapshot().values, { title: "Fresh" });
    app.editor.session.edit("title", "Local");
    app.editor.session.reset();
    assert.equal(app.editor.session.getSnapshot().values.title, "Fresh");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, external cancellation does not initialize from the restored cache and allows retry", async () => {
  const app = await setup({ cached: { title: "Old" }, query: { refetchOnMount: false } });
  try {
    assert.equal(app.editor.status, "loading");
    await act(async () => {
      await app.client.cancelQueries({ queryKey: ["task"] });
    });
    await flush();
    assert.equal(app.editor.status, "error");
    await act(() => {
      app.editor.retry();
    });
    await act(() => {
      app.requests[1].resolve({ title: "Recovered" });
    });
    await flush();
    assert.equal(app.editor.status, "ready");
    assert.equal(app.editor.session.getSnapshot().values.title, "Recovered");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, matching timestamps are ambiguous even if refetch resolves, and an explicit retry recovers", async (context) => {
  let now = 1000;
  context.mock.method(Date, "now", () => now);
  const app = await setup({
    cached: { title: "Old" },
    updatedAt: 1000,
    query: { refetchOnMount: false },
  });
  try {
    await act(() => {
      app.requests[0].resolve({ title: "New at same timestamp" });
    });
    await flush();
    assert.equal(app.query.status, "success");
    assert.equal(app.query.dataUpdatedAt, 1000);
    assert.equal(app.editor.status, "error");
    assert.match(app.editor.error.message, /refresh.*verified/u);
    assert.equal(app.requests.length, 1, "Trama does not retry automatically");
    now = 1001;
    await act(() => {
      app.editor.retry();
    });
    await act(() => {
      app.requests[1].resolve({ title: "Confirmed" });
    });
    await flush();
    assert.equal(app.editor.session.getSnapshot().values.title, "Confirmed");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, fresh cache data is accepted without requesting a refresh", async () => {
  const app = await setup({
    cached: { title: "Fresh cache" },
    updatedAt: Date.now(),
    staleTime: Infinity,
  });
  try {
    assert.equal(app.editor.status, "ready");
    assert.equal(app.editor.session.getSnapshot().values.title, "Fresh cache");
    assert.equal(app.requests.length, 0);
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, a copy of the definition is rejected as an opening error when the data is accepted", async () => {
  const app = await setup({
    cached: { title: "Fresh cache" },
    updatedAt: Date.now(),
    staleTime: Infinity,
    definition: { ...definition },
  });
  try {
    assert.equal(app.editor.status, "error");
    assert.match(String(app.editor.error), /Form definition must be created with defineForm/u);
    await act(() => {
      app.editor.retry();
    });
    await act(() => {
      app.requests.at(-1).resolve({ title: "Refreshed" });
    });
    await flush();
    assert.equal(app.editor.status, "error");
    assert.match(String(app.editor.error), /Form definition must be created with defineForm/u);
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, incompatible remote values are a recoverable error, and retry requests the source even while the cached data is fresh", async () => {
  const app = await setup({ cached: { title: 42 }, updatedAt: Date.now(), staleTime: Infinity });
  try {
    assert.equal(app.editor.status, "error");
    assert.match(app.editor.error.message, /title.*text/u);
    await act(() => {
      app.editor.retry();
    });
    assert.equal(app.editor.status, "loading");
    await act(() => {
      app.requests[0].resolve({ title: "Valid" });
    });
    await flush();
    assert.equal(app.editor.status, "ready", String(app.editor.error));
    assert.equal(app.editor.session.getSnapshot().values.title, "Valid");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, placeholder data and a disabled query wait for real data, including for the creation seed", async () => {
  const app = await setup({ query: { enabled: false, placeholderData: { title: "Placeholder" } } });
  try {
    assert.equal(app.editor.status, "loading");
    assert.equal(app.requests.length, 0);
    await app.view.render({ query: { enabled: true } });
    assert.equal(app.editor.status, "loading");
    await act(() => {
      app.requests[0].resolve({ title: "Remote seed" });
    });
    await flush();
    assert.equal(app.editor.session.getSnapshot().values.title, "Remote seed");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, a remote error and a failed select remain recoverable", async () => {
  const app = await setup({
    query: {
      select: (data) => {
        if (data.title === "Bad projection") throw new Error("Projection failed");
        return { title: data.title.toUpperCase() };
      },
    },
  });
  try {
    await act(() => {
      app.requests[0].reject(new Error("Offline server"));
    });
    await flush();
    assert.equal(app.editor.status, "error");
    assert.match(app.editor.error.message, /Offline server/u);
    await act(() => {
      app.editor.retry();
    });
    await act(() => {
      app.requests[1].resolve({ title: "Bad projection" });
    });
    await flush();
    assert.equal(app.editor.status, "error");
    assert.match(app.editor.error.message, /Projection failed/u);
    await act(() => {
      app.editor.retry();
    });
    await act(() => {
      app.requests[2].resolve({ title: "projected" });
    });
    await flush();
    assert.equal(app.editor.session.getSnapshot().values.title, "PROJECTED");
  } finally {
    await app.close();
  }
});

test("With real TanStack Query, a pause accepts fresh cache data and waits if a refresh is required", async () => {
  onlineManager.setOnline(false);
  const fresh = await setup({
    cached: { title: "Fresh offline" },
    updatedAt: Date.now(),
    staleTime: Infinity,
    query: { refetchOnMount: "always" },
  });
  const stale = await setup({ cached: { title: "Old offline" }, query: { refetchOnMount: false } });
  try {
    assert.equal(fresh.query.fetchStatus, "paused");
    assert.equal(fresh.editor.status, "ready");
    assert.equal(stale.query.fetchStatus, "paused");
    assert.equal(stale.editor.status, "loading");
    assert.equal(stale.requests.length, 0);
    await act(() => {
      onlineManager.setOnline(true);
    });
    await flush();
    await act(() => {
      stale.requests[0].resolve({ title: "Online" });
    });
    await flush();
    assert.equal(stale.editor.session.getSnapshot().values.title, "Online");
  } finally {
    onlineManager.setOnline(true);
    await fresh.close();
    await stale.close();
  }
});

test("With real TanStack Query, a ready session keeps edits and the baseline through refetches and their errors", async () => {
  const app = await setup();
  try {
    await act(() => {
      app.requests[0].resolve({ title: "Baseline" });
    });
    await flush();
    const session = app.editor.session;
    session.edit("title", "Local");
    let refresh;
    await act(() => {
      refresh = app.query.refetch();
    });
    await act(async () => {
      app.requests[1].resolve({ title: "New cache" });
      await refresh;
    });
    await flush();
    assert.equal(app.editor.session, session);
    assert.equal(session.getSnapshot().values.title, "Local");
    await act(() => {
      refresh = app.query.refetch();
    });
    await act(async () => {
      app.requests[2].reject(new Error("Background failure"));
      await refresh;
    });
    await flush();
    assert.equal(app.editor.status, "ready");
    session.reset();
    assert.equal(session.getSnapshot().values.title, "Baseline");
    assert.equal(app.requests.length, 3);
  } finally {
    await app.close();
  }
});
