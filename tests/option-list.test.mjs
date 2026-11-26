import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { pageOf, scriptedLoader, settle, shown, watch } from "./helpers/scripted-loader.mjs";

const rows = ["Ana", "Ángela", "Beto", "Carla", "Daniel"].map((label, index) => ({
  value: index + 1,
  label,
}));
const idle = { status: "idle", text: "", options: [], complete: false, error: undefined };
// What a view shows right after it starts again from page 1.
const restarted = (text = "") => ({
  status: "loading",
  text,
  labels: [],
  complete: false,
  error: undefined,
});
const failed = (message) => `Field "customer" list: request failed: ${message}`;
const option = (value, label) => ({ value, label });
// A server that answers each page from a table.
const table =
  (pages) =>
  ({ page }) =>
    Promise.resolve(pages[page]);
const serve = (request) => Promise.resolve(pageOf(rows, request));
// A function that throws the error when called, instead of returning a promise.
const throwing = (error) => () => {
  throw error;
};

// A session whose customer comes from a paged endpoint, which serves rows two
// per page unless the test answers each request. Every load records what it
// received. The session uses a scripted loader unless options replace it.
const setup = (respond = serve, options = {}) => {
  const requests = [];
  const sales = defineEndpoints({
    customers: endpoint.options((request, params) => {
      requests.push({ request, params });
      return respond(request, params);
    }),
  });
  const { defineForm, field } = createForms({ endpoints: [sales] });
  const definition = defineForm({
    fields: { customer: field.async("customers"), note: field.text() },
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(definition, { scope: "acme", loader, ...options });
  return { session, calls, requests };
};

test("open requests page 1 and more appends the next page without repeating options from previous pages", async () => {
  const { session, calls } = setup(
    table({
      1: { options: [option(1, "Ana"), option(2, "Beto")], more: true },
      2: { options: [option(2, "Beto again"), option(3, "Carla")], more: true },
      3: { options: [option(1, "Ana again"), option(4, "Daniel")], more: false },
    }),
  );
  const before = session.getSnapshot();
  const { view } = watch(session, "customer");
  assert.deepEqual(view.getSnapshot(), idle);
  assert.equal(calls.length, 0, "Subscribing makes no request");
  view.open();
  assert.deepEqual(shown(view), restarted());
  assert.deepEqual(calls[0].key, ["trama", "acme", "customers", {}, "", 1]);
  await calls[0].resolve();
  const ready = { status: "ready", text: "", complete: false, error: undefined };
  assert.deepEqual(shown(view), { ...ready, labels: ["Ana", "Beto"] });
  view.more();
  assert.deepEqual(shown(view), { ...ready, status: "loading", labels: ["Ana", "Beto"] });
  assert.deepEqual(calls[1].key, ["trama", "acme", "customers", {}, "", 2]);
  await calls[1].resolve();
  assert.deepEqual(shown(view), { ...ready, labels: ["Ana", "Beto", "Carla"] });
  view.more();
  assert.equal(calls[2].key[5], 3);
  await calls[2].resolve();
  const labels = ["Ana", "Beto", "Carla", "Daniel"];
  assert.deepEqual(shown(view), { ...ready, labels, complete: true });
  view.more();
  assert.equal(calls.length, 3, "A complete list makes no further requests");
  assert.equal(session.getSnapshot(), before, "The list does not write to the session");
});

test("A repeated value within a page is a page error, and an empty page with more: true does not complete the list", async () => {
  const { session, calls } = setup(
    table({
      1: { options: [option(1, "Ana")], more: true },
      2: { options: [], more: true },
      3: { options: [option(17, "Beto"), option(18, "Carla"), option(17, "Repeat")], more: false },
    }),
  );
  const { view } = watch(session, "customer");
  view.open();
  await calls[0].resolve();
  view.more();
  await calls[1].resolve();
  const kept = { text: "", labels: ["Ana"], complete: false };
  assert.deepEqual(shown(view), { status: "ready", ...kept, error: undefined });
  view.more();
  assert.equal(calls[2].key[5], 3);
  await calls[2].resolve();
  const cause = 'Endpoint "customers" page 3: duplicate option value 17';
  assert.deepEqual(shown(view), { status: "error", ...kept, error: failed(cause) });
  assert.ok(view.getSnapshot().error instanceof Error);
  assert.equal(view.getSnapshot().error.cause.message, cause);
});

test("A new search restarts the list and discards the previous response that arrives out of order. Each view searches separately", async () => {
  const { session, calls } = setup();
  const watched = watch(session, "customer");
  const { view } = watched;
  const other = watch(session, "customer").view;
  view.open();
  await calls[0].resolve();
  view.more();
  view.search("an");
  assert.equal(calls[1].signal.aborted, true);
  assert.deepEqual(shown(view), restarted("an"));
  assert.deepEqual(calls[2].key, ["trama", "acme", "customers", {}, "an", 1]);
  view.search("be");
  assert.equal(calls[2].signal.aborted, true);
  await calls[3].resolve();
  const settled = view.getSnapshot();
  const notifications = watched.notifications;
  const found = { status: "ready", text: "be", labels: ["Beto"], complete: true, error: undefined };
  assert.deepEqual(shown(view), found);
  await calls[2].resolve();
  await calls[1].resolve();
  assert.equal(view.getSnapshot(), settled);
  assert.equal(watched.notifications, notifications);
  assert.deepEqual(other.getSnapshot(), idle);
  other.search("da");
  assert.deepEqual(calls[4].key.slice(4), ["da", 1]);
  assert.equal(view.getSnapshot(), settled);
});

test("Each open starts a new attempt from page 1 with the current text and discards the previous attempt even with the same key", async () => {
  const { session, calls } = setup();
  const { view } = watch(session, "customer");
  view.search("a");
  await calls[0].resolve();
  view.more();
  await calls[1].resolve();
  view.open();
  assert.deepEqual(shown(view), restarted("a"));
  view.open();
  assert.deepEqual(calls[3].key, ["trama", "acme", "customers", {}, "a", 1]);
  assert.deepEqual(calls[2].key, calls[3].key);
  assert.deepEqual([calls[2].signal.aborted, calls[3].signal.aborted], [true, false]);
  await calls[2].resolve();
  assert.equal(shown(view).status, "loading", "A response from another attempt is discarded");
  view.open();
  await calls[3].reject(new Error("Late"));
  assert.equal(shown(view).status, "loading", "A failure from another attempt is discarded");
  await calls[4].resolve();
  const labels = ["Ana", "Ángela"];
  assert.deepEqual(shown(view), {
    status: "ready",
    text: "a",
    labels,
    complete: false,
    error: undefined,
  });
});

test("The key is [trama, scope, endpoint, params, text, page], and load receives the search text, page, signal, and scope", async () => {
  const scopes = [
    ["acme", "acme"],
    [7, 7],
    ["", ""],
    [-0, 0],
  ];
  const opened = scopes.map(([scope]) => {
    const { session, calls, requests } = setup(serve, { scope });
    watch(session, "customer").view.search("be");
    return { calls, requests };
  });
  await Promise.all(opened.map(({ calls }) => calls[0].resolve()));
  for (const [index, [scope, keyed]] of scopes.entries()) {
    const [call] = opened[index].calls;
    assert.deepEqual(call.key, ["trama", keyed, "customers", {}, "be", 1]);
    for (const value of [call.key, call.key[3]]) assert.ok(Object.isFrozen(value));
    const [{ request, params }] = opened[index].requests;
    assert.equal(request.signal, call.signal);
    assert.deepEqual(params, {});
    assert.ok(Object.isFrozen(request));
    if (!Object.is(scope, -0))
      assert.deepEqual(request, { search: "be", page: 1, signal: call.signal, scope });
  }
});

test("A load or transport failure is wrapped with its cause, and retry repeats the failed page while keeping previous pages", async () => {
  const boom = new Error("Server unavailable");
  let failing = true;
  const { session, calls } = setup((request) =>
    failing && request.page === 2 ? Promise.reject(boom) : serve(request),
  );
  const { view } = watch(session, "customer");
  view.search("a");
  await calls[0].resolve();
  view.more();
  await calls[1].resolve();
  const kept = { text: "a", labels: ["Ana", "Ángela"], complete: false };
  assert.deepEqual(shown(view), { status: "error", ...kept, error: failed("Server unavailable") });
  assert.equal(view.getSnapshot().error.cause, boom);
  view.more();
  assert.equal(calls.length, 2);
  view.retry();
  assert.deepEqual(calls[2].key, ["trama", "acme", "customers", {}, "a", 2]);
  const { status, labels } = shown(view);
  assert.deepEqual({ status, labels }, { status: "loading", labels: kept.labels });
  const transport = new Error("No connection");
  await calls[2].reject(transport);
  assert.deepEqual(shown(view), { status: "error", ...kept, error: failed("No connection") });
  assert.equal(view.getSnapshot().error.cause, transport);
  failing = false;
  view.retry();
  await calls[3].resolve();
  const all = ["Ana", "Ángela", "Carla", "Daniel"];
  assert.deepEqual(shown(view), {
    ...kept,
    status: "ready",
    labels: all,
    complete: true,
    error: undefined,
  });
});

test("more and retry do nothing outside their state, making no requests or notifications and leaving the snapshot unchanged", async () => {
  const { session, calls } = setup();
  const watched = watch(session, "customer");
  const { view } = watched;
  const inert = (status, ...actions) => {
    const [before, notifications, requested] = [
      view.getSnapshot(),
      watched.notifications,
      calls.length,
    ];
    assert.equal(before.status, status);
    for (const action of actions) view[action]();
    assert.equal(view.getSnapshot(), before, status);
    assert.deepEqual([watched.notifications, calls.length], [notifications, requested], status);
  };
  inert("idle", "more", "retry");
  view.open();
  inert("loading", "more", "retry");
  await calls[0].resolve();
  inert("ready", "retry");
  view.search("be");
  await calls[1].resolve();
  inert("ready", "more", "retry");
});

test("The list does not throw or touch the session on a load or loader failure, even without a promise", async () => {
  const boom = new Error("Call failed");
  const transport = new Error("Loader unavailable");
  const failures = [
    [throwing(boom), undefined, boom],
    [() => Promise.reject(boom), undefined, boom],
    [serve, throwing(transport), transport],
    [serve, () => Promise.reject(transport), transport],
  ].map(([respond, loader, cause]) => {
    const { session } = setup(respond, { loader });
    const before = session.getSnapshot();
    const notified = { count: 0 };
    session.subscribe(() => notified.count++);
    const { view } = watch(session, "customer");
    view.open();
    return { session, before, notified, view, cause };
  });
  await settle();
  for (const { session, before, notified, view, cause } of failures) {
    assert.equal(view.getSnapshot().status, "error");
    assert.equal(view.getSnapshot().error.message, failed(cause.message));
    assert.equal(view.getSnapshot().error.cause, cause);
    assert.equal(session.getSnapshot(), before);
    assert.equal(notified.count, 0);
  }
});
