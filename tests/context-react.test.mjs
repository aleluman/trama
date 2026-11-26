import assert from "node:assert/strict";
import { test } from "node:test";
import { StrictMode, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { declareContext, defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { act, createElement as h, flush, mount } from "./helpers/react.mjs";
import { scriptedQuery } from "./helpers/scripted-query.mjs";

// Every evaluation of defaults, with the context it received.
const evaluated = [];
// The label of title shows the mode and deliveryDate takes today: the session
// shows which context its rules received.
const order = defineForm({
  context: declareContext(),
  defaults: (current) => {
    evaluated.push(current);
    return { deliveryDate: current.today };
  },
  fields: { title: field.text(), deliveryDate: field.text() },
  rules: { title: { label: (_, tools) => tools.context.mode } },
});
const plain = defineForm({ fields: { title: field.text() } });
const { useFormSession } = createReactBinding({ text: () => null });
const edit = { mode: "edit", today: "2026-09-27", currency: { code: "JPY", taxRate: 0.2 } };
const seenBy = (session) => {
  const { values, fieldStates } = session.getSnapshot();
  return [fieldStates.title.label, values.deliveryDate];
};
const strict = (Component) => (props) => h(StrictMode, null, h(Component, props));

// An editor whose every render passes a new copy of its context.
async function openEditor(props, wrap = false) {
  let editor;
  function Editor({ id, current, form = order }) {
    const next = useFormSession(form, {
      key: id,
      context: current === undefined ? undefined : structuredClone(current),
    });
    useLayoutEffect(() => {
      editor = next;
    });
    return null;
  }
  const view = await mount(wrap ? strict(Editor) : Editor, props);
  return {
    view,
    get editor() {
      return editor;
    },
  };
}

// An editor that opens from a scripted query, with a new copy of its context in each render.
async function openLoading(source, current, wrap = false) {
  let editor;
  function Editor(props) {
    const query = useSyncExternalStore(source.subscribe, () => source.current);
    const next = useFormSession(order, {
      context: structuredClone(props.current),
      initial: initialFromQuery(query),
    });
    useLayoutEffect(() => {
      editor = next;
    });
    return null;
  }
  const view = await mount(wrap ? strict(Editor) : Editor, { current });
  return {
    view,
    get editor() {
      return editor;
    },
  };
}
const loaded = { status: "success", data: { title: "Loaded" }, isStale: false, dataUpdatedAt: 1 };
// Answers every pending refresh of the source with the loaded result.
const answer = async (source) => {
  await act(() => {
    for (const refetch of source.refetches) refetch.resolve(loaded);
  });
  await flush();
};

test("useFormSession requires the declared context, passes it to the session, and reports session errors", async () => {
  const app = await openEditor({ current: edit });
  try {
    assert.equal(app.editor.status, "ready");
    assert.deepEqual(seenBy(app.editor.session), ["edit", "2026-09-27"]);
  } finally {
    await app.view.unmount();
  }
  await assert.rejects(openEditor({}), { message: "Form requires a context" });
  await assert.rejects(openEditor({ form: plain, current: edit }), {
    message: "Form declares no context",
  });
  await assert.rejects(openEditor({ current: { ...edit, today: new Date(0) } }), {
    message: 'Session context must be plain data: a Date at "today"',
  });
});

test("once the session is ready, deeply equal context preserves it and changing context with the same session key throws", async () => {
  const app = await openEditor({ id: "A", current: edit });
  try {
    const first = app.editor.session;
    await app.view.render({ id: "A", current: structuredClone(edit) });
    await app.view.render({ id: "A", current: { ...edit, currency: { ...edit.currency } } });
    assert.equal(app.editor.session, first);
    assert.deepEqual(seenBy(first), ["edit", "2026-09-27"]);
    await assert.rejects(
      app.view.render({ id: "A", current: { ...edit, currency: { code: "MXN", taxRate: 0.2 } } }),
      { message: "Changing context requires a different session key" },
    );
  } finally {
    await app.view.unmount();
  }
  const other = await openEditor({ id: "A", current: edit });
  try {
    await assert.rejects(other.view.render({ id: "A", current: { ...edit, mode: "view" } }), {
      message: "Changing context requires a different session key",
    });
  } finally {
    await other.view.unmount();
  }
});

test("equal context with keys in a different order preserves the session", async () => {
  const app = await openEditor({ id: "A", current: edit });
  try {
    const first = app.editor.session;
    const { mode, today, currency } = edit;
    const reordered = { currency: { taxRate: currency.taxRate, code: currency.code }, today, mode };
    await app.view.render({ id: "A", current: reordered });
    assert.equal(app.editor.session, first);
  } finally {
    await app.view.unmount();
  }
});

test("changing the key and context together creates another session with the new context", async () => {
  const app = await openEditor({ id: "A", current: edit });
  try {
    const first = app.editor.session;
    await app.view.render({ id: "B", current: { ...edit, mode: "view", today: "2026-12-24" } });
    assert.notEqual(app.editor.session, first);
    assert.deepEqual(seenBy(app.editor.session), ["view", "2026-12-24"]);
    assert.deepEqual(seenBy(first), ["edit", "2026-09-27"]);
  } finally {
    await app.view.unmount();
  }
});

test("while loading from TanStack Query, context changes without error and the session is created with the context from the latest render", async () => {
  const source = scriptedQuery();
  const app = await openLoading(source, edit);
  try {
    assert.equal(app.editor.status, "loading");
    await app.view.render({ current: { ...edit, mode: "create" } });
    const latest = { ...edit, mode: "view", today: "2026-12-24" };
    await app.view.render({ current: latest });
    assert.equal(app.editor.status, "loading");
    evaluated.length = 0;
    await answer(source);
    assert.equal(app.editor.status, "ready");
    assert.deepEqual(seenBy(app.editor.session), ["view", "2026-12-24"]);
    assert.equal(app.editor.session.getSnapshot().values.title, "Loaded");
    assert.ok(evaluated.length > 0);
    for (const current of evaluated) assert.deepEqual(current, latest);
    // Once ready, the context of the session is the one it compares.
    const session = app.editor.session;
    await app.view.render({ current: structuredClone(latest) });
    assert.equal(app.editor.session, session);
    await assert.rejects(app.view.render({ current: edit }), {
      message: "Changing context requires a different session key",
    });
  } finally {
    await app.view.unmount();
  }
});

test("in StrictMode, defaults may run for each candidate session, and the published session uses the current context", async () => {
  evaluated.length = 0;
  const app = await openEditor({ id: "A", current: edit }, true);
  try {
    assert.ok(evaluated.length > 0);
    for (const current of evaluated) assert.deepEqual(current, edit);
    const first = app.editor.session;
    assert.deepEqual(seenBy(first), ["edit", "2026-09-27"]);
    await app.view.render({ id: "A", current: structuredClone(edit) });
    assert.equal(app.editor.session, first);
    await app.view.render({ id: "B", current: { ...edit, mode: "view", today: "2026-12-24" } });
    assert.notEqual(app.editor.session, first);
    assert.deepEqual(seenBy(app.editor.session), ["view", "2026-12-24"]);
  } finally {
    await app.view.unmount();
  }
});

test("in StrictMode, opening from TanStack Query creates the session with the context from the latest render", async () => {
  const source = scriptedQuery();
  const app = await openLoading(source, edit, true);
  try {
    const latest = { ...edit, mode: "create", today: "2027-01-01" };
    await app.view.render({ current: latest });
    evaluated.length = 0;
    await answer(source);
    assert.equal(app.editor.status, "ready");
    assert.deepEqual(seenBy(app.editor.session), ["create", "2027-01-01"]);
    assert.ok(evaluated.length > 0);
    for (const current of evaluated) assert.deepEqual(current, latest);
  } finally {
    await app.view.unmount();
  }
});

test("outside act, a query that resolves in the same commit as a new context opens with that context", async () => {
  const source = scriptedQuery();
  const errors = [];
  let editor;
  function Editor({ current, settle }) {
    const query = useSyncExternalStore(source.subscribe, () => source.current);
    const next = useFormSession(order, {
      context: structuredClone(current),
      initial: initialFromQuery(query),
    });
    useLayoutEffect(() => {
      editor = next;
      // The refresh settles during the commit, before the passive effects run.
      if (settle) for (const refetch of source.refetches.splice(0)) refetch.resolve(loaded);
    });
    return null;
  }
  const root = createRoot(document.createElement("div"), {
    onUncaughtError: (error) => errors.push(error),
  });
  await act(() => root.render(h(Editor, { current: edit })));
  await flush();
  assert.deepEqual([editor.status, source.refetches.length], ["loading", 1]);
  const latest = { ...edit, mode: "view", today: "2026-12-24" };
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    root.render(h(Editor, { current: latest, settle: true }));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  assert.deepEqual(errors, []);
  assert.equal(editor.status, "ready");
  assert.deepEqual(seenBy(editor.session), ["view", "2026-12-24"]);
  await act(() => root.unmount());
});
