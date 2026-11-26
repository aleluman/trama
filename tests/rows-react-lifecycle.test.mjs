import assert from "node:assert/strict";
import { test } from "node:test";
import { StrictMode, useLayoutEffect, useState } from "react";
import { useRows } from "trama-forms/react";
import { act, createElement as h, flush, mount } from "./helpers/react.mjs";
import {
  Boundary,
  Modal,
  Table,
  cell,
  instrumented,
  linesOf,
  opened,
  order,
  type,
  visual,
} from "./helpers/rows-react.mjs";
import { keysOf, rejects } from "./helpers/session.mjs";

const names = ["product", "quantity", "amount"];
const initial = { lines: [{ product: "Table", price: 2 }, { product: "Chair" }] };

// What React reports to console.error during a test: warnings about keys,
// uncached snapshots or updates outside act.
const consoleErrors = (t) => {
  const calls = [];
  t.mock.method(console, "error", (...args) => {
    calls.push(args);
  });
  return calls;
};

// The binding of the editor in StrictMode, whose hook is statically known.
const strict = instrumented();
const { useFormSession } = strict;
const button = (name, onClick) => h("button", { name, onClick }, name);

// An editor that opens its session, hands it to the test, edits its lines with
// buttons, and keeps a modal on the row that came first at opening.
function Editor({ onOpen }) {
  const editor = useFormSession(order, { initial });
  const session = editor.status === "ready" ? editor.session : undefined;
  useLayoutEffect(() => {
    if (session !== undefined) onOpen(session);
  }, [onOpen, session]);
  return session === undefined ? null : h(Lines, { session });
}
function Lines({ session }) {
  const keys = useRows(session, "lines");
  const [first] = useState(() => session.row("lines", keysOf(session)[0]));
  return h(
    "div",
    null,
    button("add", () => session.add("lines", [{ product: "New" }])),
    button("move", () => session.move("lines", keys.at(-1), 0)),
    button("remove", () => session.remove("lines", [keys[1]])),
    button("reset", () => session.reset()),
    h(Table, { Field: strict.Field, session, names }),
    h(Modal, { Field: strict.Field, line: first, names }),
  );
}

// The document shows each row once, in the order of the session, with its
// values, and as many renderers are mounted as inputs are shown.
const consistent = (view, session, counts) => {
  assert.deepEqual(visual(view), keysOf(session));
  assert.deepEqual(
    visual(view).map((key) => cell(view, key, "product").value),
    linesOf(session).map(({ product }) => product),
  );
  assert.equal(counts.live, view.container.querySelectorAll("input").length);
};

test("In StrictMode, mounting, adding, moving, removing, editing, and resetting with useRows and Field row neither throws nor duplicates effects", async (t) => {
  const errors = consoleErrors(t);
  const { counts } = strict;
  let session;
  const onOpen = (opening) => {
    session = opening;
  };
  const view = await mount(() => h(StrictMode, null, h(Editor, { onOpen })));
  const published = [];
  const stop = session.subscribe(() => published.push(keysOf(session)));
  const click = (name) => act(() => view.container.querySelector(`[name="${name}"]`).click());
  try {
    const [first, second] = keysOf(session);
    consistent(view, session, counts);
    await click("add");
    const [, , added] = keysOf(session);
    await click("move");
    consistent(view, session, counts);
    assert.deepEqual(keysOf(session), [added, first, second]);
    await click("remove");
    consistent(view, session, counts);
    assert.deepEqual(keysOf(session), [added, second]);
    assert.equal(cell(view, `modal-${first}`, "product")?.value, undefined);
    await type(cell(view, second, "quantity"), "3");
    await click("reset");
    consistent(view, session, counts);
    assert.deepEqual(keysOf(session), [first, second]);
    assert.equal(cell(view, `modal-${first}`, "product").value, "Table");
    assert.equal(published.length, 5, "One publication per command and per edit");
    assert.deepEqual(errors, []);
  } finally {
    stop();
    await view.unmount();
  }
});

test("An onChange retained by a renderer after its row is removed is ignored without throwing inside React or publishing", async () => {
  const { Field, callbacks } = instrumented();
  const session = opened(initial.lines);
  const [first, second] = keysOf(session);
  const [added] = session.add("lines", [{ product: "Bench" }]);
  const errors = [];
  const view = await mount(() => h(Boundary, { errors }, h(Table, { Field, session, names })));
  try {
    const removed = [first, added];
    const retained = removed.map((key) => callbacks.get(cell(view, key, "product").id));
    const handles = removed.map((key) => session.row("lines", key));
    await act(() => session.remove("lines", removed));
    assert.deepEqual(visual(view), [second]);
    const before = session.getSnapshot();
    const published = [];
    const stop = session.subscribe(() => published.push(session.getSnapshot()));
    await act(() => {
      for (const onChange of retained) onChange("Late");
    });
    stop();
    assert.equal(session.getSnapshot(), before);
    assert.deepEqual(published, []);
    assert.deepEqual(errors, []);
    // The handle of the same row rejects that edit with its diagnostic.
    for (const line of handles)
      rejects(
        session,
        () => line.edit("product", "Late"),
        `Collection "lines": row "${line.key}" was removed`,
      );
  } finally {
    await view.unmount();
  }
});

// A view of the session whose subscriptions, and those of its handles, are
// counted while open.
const counted = (session) => {
  const open = { count: 0 };
  const track = (subscribe) => (listener) => {
    open.count += 1;
    const stop = subscribe(listener);
    return () => {
      open.count -= 1;
      stop();
    };
  };
  const handles = new Map();
  const row = (collection, key) => {
    if (!handles.has(key)) {
      const line = session.row(collection, key);
      handles.set(key, { ...line, subscribe: track(line.subscribe) });
    }
    return handles.get(key);
  };
  return { open, tracked: { ...session, subscribe: track(session.subscribe), row } };
};

// Every kind of operation of the session, outside act: an update React
// received would warn.
const operate = (session) => {
  const [first, second] = keysOf(session);
  session.edit("rate", 2);
  session.row("lines", first).edit("quantity", 4);
  const [added] = session.add("lines", [{ product: "Bench" }], { at: 0 });
  session.move("lines", added, 2);
  session.patch({ lines: { [second]: { price: 5 } } });
  session.remove("lines", [first]);
  session.reset();
};

test("Unmounting closes the table and row Field subscriptions, so subsequent session operations render nothing", async (t) => {
  const errors = consoleErrors(t);
  const { Field, counts } = instrumented();
  const session = opened(initial.lines);
  const [first] = keysOf(session);
  const { open, tracked } = counted(session);
  const commits = [];
  const view = await mount(() =>
    h(
      "div",
      null,
      h(Table, { Field, session: tracked, names, commits }),
      h(Modal, { Field, line: tracked.row("lines", first), names }),
    ),
  );
  assert.equal(open.count, 1 + names.length * 3, "The table, two rows and the modal");
  await view.unmount();
  assert.equal(open.count, 0);
  const before = [counts.commits, commits.length];
  operate(session);
  await flush();
  assert.deepEqual([counts.commits, commits.length], before);
  assert.equal(session.getSnapshot().resetVersion, 1, "Every operation ran");
  assert.deepEqual(errors, []);
});
