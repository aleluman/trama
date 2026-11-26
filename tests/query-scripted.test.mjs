import assert from "node:assert/strict";
import { test } from "node:test";
import { openEditor, scriptedQuery } from "./helpers/scripted-query.mjs";

const success = (title, dataUpdatedAt, patch = {}) => ({
  status: "success",
  data: { title },
  isStale: false,
  dataUpdatedAt,
  ...patch,
});
const title = (app) => app.editor.session.getSnapshot().values.title;

test("With a scripted source, result updates do not duplicate the pending refresh, which uses the contract options", async () => {
  const source = scriptedQuery({ status: "success", data: { title: "Old" }, dataUpdatedAt: 1 });
  const app = await openEditor(source);
  try {
    assert.equal(app.editor.status, "loading");
    assert.deepEqual(
      source.refetches.map(({ options }) => options),
      [{ cancelRefetch: false, throwOnError: true }],
    );
    await app.step(() => source.set({ data: { title: "Old" } }));
    await app.step(() => source.set({ isStale: true }));
    await app.step(() => source.set({ status: "success" }));
    assert.equal(source.refetches.length, 1);
    await app.step(() => source.refetches[0].resolve(success("Fresh", 2)));
    assert.equal(app.editor.status, "ready");
    assert.equal(title(app), "Fresh");
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, cached results with an error, placeholder, or no data are rejected", async () => {
  const kept = { data: { title: "Kept" }, isStale: false, dataUpdatedAt: 1 };
  const requestsSource = async (state) => {
    const source = scriptedQuery({ ...kept, ...state });
    const app = await openEditor(source);
    try {
      assert.equal(app.editor.status, "loading");
      assert.equal(source.refetches.length, 1);
    } finally {
      await app.unmount();
    }
  };
  await requestsSource({ status: "error", error: new Error("Background failure") });
  await requestsSource({ status: "success", isPlaceholderData: true });
  const source = scriptedQuery({ status: "success", isStale: false, dataUpdatedAt: 1 });
  const app = await openEditor(source);
  try {
    assert.equal(app.editor.status, "error");
    assert.equal(app.editor.error.message, "Initial query has no data");
    assert.equal(source.refetches.length, 0);
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, each invalid refresh result is a recoverable error and preserves the result's error", async () => {
  const problem = new Error("Remote failure");
  const source = scriptedQuery({ status: "success", data: { title: "Old" }, dataUpdatedAt: 1 });
  const app = await openEditor(source);
  // Each invalid result is newer and valid except for one of its members.
  const refresh = (dataUpdatedAt, patch) =>
    app.step(() => source.refetches.at(-1).resolve(success("New", dataUpdatedAt, patch)));
  const retry = () => app.step(() => app.editor.retry());
  try {
    await refresh(5, { status: "error", error: problem });
    assert.equal(app.editor.error, problem);
    await retry();
    await refresh(5, { status: "error", error: "" });
    assert.equal(app.editor.status, "error");
    assert.equal(app.editor.error, "");
    await retry();
    await refresh(5, { status: "pending", error: null });
    assert.match(app.editor.error.message, /refresh.*verified/u);
    await retry();
    await refresh(5, { isPlaceholderData: true });
    assert.match(app.editor.error.message, /refresh.*verified/u);
    await retry();
    await refresh(5, { data: undefined });
    assert.equal(app.editor.error.message, "Initial query has no data");
    // The clock goes back: the refresh is older than the result it replaces.
    await app.step(() => source.set({ dataUpdatedAt: 10 }));
    await retry();
    await refresh(9);
    assert.match(app.editor.error.message, /refresh.*verified/u);
    await retry();
    await refresh(11);
    assert.equal(app.editor.status, "ready");
    assert.equal(title(app), "New");
    assert.equal(source.refetches.length, 7);
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, disabling also discards a late rejection", async () => {
  const source = scriptedQuery();
  const app = await openEditor(source);
  try {
    assert.equal(source.refetches.length, 1);
    await app.step(() => source.set({ isEnabled: false }));
    await app.step(() => source.refetches[0].reject(new Error("Late failure")));
    assert.equal(app.editor.status, "loading");
    await app.step(() => source.set({ isEnabled: true }));
    assert.equal(source.refetches.length, 2);
    await app.step(() => source.refetches[1].resolve(success("Enabled", 1)));
    assert.equal(app.editor.status, "ready");
    assert.equal(title(app), "Enabled");
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, retry forces the source throughout loading, including after an invalidated request", async () => {
  const source = scriptedQuery({
    status: "success",
    data: { title: 42 },
    isStale: false,
    dataUpdatedAt: 1,
  });
  const app = await openEditor(source);
  try {
    assert.equal(app.editor.status, "error");
    assert.equal(source.refetches.length, 0);
    await app.step(() => app.editor.retry());
    assert.equal(source.refetches.length, 1);
    await app.step(() => source.set({ isEnabled: false }));
    await app.step(() => source.refetches[0].resolve(success("Discarded", 2)));
    assert.equal(app.editor.status, "loading");
    // Fresh and valid, but the retry still requires a newer result.
    await app.step(() =>
      source.set({ isEnabled: true, data: { title: "Cached" }, dataUpdatedAt: 2 }),
    );
    assert.equal(app.editor.status, "loading");
    assert.equal(source.refetches.length, 2);
    await app.step(() => source.refetches[1].resolve(success("Confirmed", 3)));
    assert.equal(app.editor.status, "ready");
    assert.equal(title(app), "Confirmed");
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, a stale retry from the same opening does not request again", async () => {
  const source = scriptedQuery({ status: "success", data: { title: "Old" }, dataUpdatedAt: 1 });
  const app = await openEditor(source);
  try {
    await app.step(() => source.refetches[0].reject(new Error("First failure")));
    const first = app.editor.retry;
    await app.step(first);
    assert.equal(app.editor.status, "loading");
    await app.step(first);
    assert.equal(source.refetches.length, 2);
    await app.step(() => source.refetches[1].reject(new Error("Second failure")));
    const second = app.editor;
    await app.step(first);
    assert.equal(app.editor, second);
    assert.equal(source.refetches.length, 2);
    await app.step(second.retry);
    await app.step(() => source.refetches[2].resolve(success("Recovered", 2)));
    const { session } = app.editor;
    await app.step(first);
    assert.equal(app.editor.session, session);
    assert.equal(title(app), "Recovered");
    assert.equal(source.refetches.length, 3);
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, hiding with Activity discards the attempt and showing it resumes loading as when re-enabled", async () => {
  const pending = scriptedQuery();
  const app = await openEditor(pending);
  try {
    await app.hide(true);
    await app.step(() => pending.refetches[0].resolve(success("Hidden", 1)));
    await app.hide(false);
    assert.equal(app.editor.status, "loading");
    assert.equal(pending.refetches.length, 2);
    await app.step(() => pending.refetches[1].resolve(success("Shown", 2)));
    assert.equal(title(app), "Shown");
  } finally {
    await app.unmount();
  }
  const cached = scriptedQuery();
  const other = await openEditor(cached);
  try {
    await other.hide(true);
    await other.step(() => {
      cached.set({
        status: "success",
        data: { title: "Cached" },
        isStale: false,
        dataUpdatedAt: 2,
      });
      cached.refetches[0].resolve(success("Hidden", 1));
    });
    await other.hide(false);
    assert.equal(other.editor.status, "ready");
    assert.equal(title(other), "Cached");
    assert.equal(cached.refetches.length, 1);
  } finally {
    await other.unmount();
  }
});

test("With a scripted source, retry from an inactive opening is ignored and the same error remains when shown", async () => {
  const failure = new Error("Remote failure");
  const source = scriptedQuery({ status: "success", data: { title: "Old" }, dataUpdatedAt: 1 });
  const app = await openEditor(source);
  try {
    await app.step(() => source.refetches[0].reject(failure));
    const failed = app.editor;
    assert.equal(failed.status, "error");
    await app.hide(true);
    await app.step(failed.retry);
    assert.equal(source.refetches.length, 1);
    await app.hide(false);
    assert.deepEqual(
      [app.editor.status, app.editor.error, app.editor.retry === failed.retry],
      ["error", failure, true],
    );
    assert.equal(source.refetches.length, 1);
    await app.step(app.editor.retry);
    assert.equal(source.refetches.length, 2);
    await app.step(() => source.refetches[1].resolve(success("Recovered", 2)));
    assert.equal(title(app), "Recovered");
  } finally {
    await app.unmount();
  }
});

test("With a scripted source, the source of initial is decided when the opening is created. Switching to values while loading is ignored and the pending request opens the session", async () => {
  const source = scriptedQuery({ status: "success", data: { title: "Old" }, dataUpdatedAt: 1 });
  const app = await openEditor(source);
  try {
    assert.equal(app.editor.status, "loading");
    await app.initial({ title: "Values" });
    assert.equal(app.editor.status, "loading");
    assert.equal(source.refetches.length, 1);
    await app.step(() => source.refetches[0].resolve(success("Fresh", 2)));
    assert.equal(app.editor.status, "ready");
    assert.equal(title(app), "Fresh");
    await app.initial({ title: "Ignored" });
    assert.equal(title(app), "Fresh");
  } finally {
    await app.unmount();
  }
});
