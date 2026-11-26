import assert from "node:assert/strict";
import { test } from "node:test";
import { StrictMode, useLayoutEffect, useState } from "react";
import { createSession } from "trama-forms/core";
import { createReactBinding, useRows } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import { Boundary } from "./helpers/rows-react.mjs";
import { handlesOf, orderOf, saved, scope, setup } from "./helpers/rows-async.mjs";
import { keysOf } from "./helpers/session.mjs";

// A renderer of text and numbers that only shows its value.
const input = ({ name, value }) => h("input", { name, value: String(value ?? ""), readOnly: true });
// The async renderer records the props it committed; the label of the view
// tells two views of the same field apart.
function recording() {
  const renders = [];
  function Remote(props) {
    useLayoutEffect(() => {
      renders.push(props);
    });
    return h("output", { name: props.name }, props.list.status);
  }
  const binding = createReactBinding({ text: input, number: input, async: Remote });
  const last = (label) => renders.findLast((props) => props.label === label);
  return { ...binding, renders, last };
}
const seen = (list) => [list.status, list.text, list.options.map((item) => item.label)];

test("The table cell and the row modal are distinct views of the row's async field", async () => {
  const { open, asked } = setup();
  const { Field, last } = recording();
  const session = open([saved(1, "north"), saved(3, "south")]);
  const [first, second] = handlesOf(session);
  const view = await mount(() =>
    h(
      "div",
      null,
      h(Field, { row: first, name: "lot", label: "table 1" }),
      h(Field, { row: second, name: "lot", label: "table 2" }),
      h(Field, { row: first, name: "lot", label: "modal" }),
    ),
  );
  try {
    await act(() => last("modal").list.open());
    await act(() => last("table 2").list.open());
    assert.deepEqual(
      asked("lots").map(({ key }) => key[3]),
      [
        { product: 1, warehouse: "north" },
        { product: 3, warehouse: "south" },
      ],
    );
    await act(() => Promise.all(asked("lots").map((request) => request.resolve())));
    await act(() => last("modal").list.search("lot 2"));
    assert.deepEqual(seen(last("modal").list), ["ready", "lot 2", ["Lot 2 of 1 in north"]]);
    assert.deepEqual(seen(last("table 1").list), ["idle", "", []]);
    assert.deepEqual(seen(last("table 2").list), [
      "ready",
      "",
      ["Lot 1 of 3 in south", "Lot 2 of 3 in south"],
    ]);
    // Editing the warehouse of one row reloads only the open views of that row.
    await act(() => first.edit("warehouse", "center"));
    assert.deepEqual(seen(last("modal").list), ["loading", "lot 2", []]);
    assert.equal(last("table 2").list.status, "ready");
    assert.equal(asked("lots").at(-1).key[3].warehouse, "center");
  } finally {
    await view.unmount();
  }
});

test("Reset remounts the row async views and editing preserves their mounts", async () => {
  const { open, asked } = setup();
  const { Field, last } = recording();
  const session = open([saved(1, "north")]);
  const [line] = handlesOf(session);
  const view = await mount(() => h(Field, { row: line, name: "product", label: "product" }));
  try {
    const { open: action } = last("product").list;
    await act(() => last("product").list.open());
    await act(() => asked("products")[0].resolve());
    await act(() => line.edit("quantity", 3));
    assert.equal(last("product").list.open, action);
    assert.equal(last("product").list.status, "ready");
    await act(() => session.reset());
    assert.notEqual(last("product").list.open, action);
    assert.deepEqual(seen(last("product").list), ["idle", "", []]);
  } finally {
    await view.unmount();
  }
});

test("The same Field moved to another row mounts another list that follows the new row without receiving the previous row's pending response", async () => {
  const { open, asked } = setup();
  const { Field, last } = recording();
  const session = open([saved(1, "north"), saved(3, "south")]);
  const [first, second] = handlesOf(session);
  let show;
  function Picker() {
    const [line, setLine] = useState(first);
    useLayoutEffect(() => {
      show = setLine;
    }, []);
    return h(Field, { row: line, name: "lot", label: "lot" });
  }
  const view = await mount(Picker);
  try {
    await act(() => last("lot").list.open());
    await act(() => last("lot").list.search("1"));
    const pending = asked("lots")[0];
    await act(() => show(second));
    assert.ok(pending.signal.aborted, "the list of the first row leaves with its request");
    assert.deepEqual(seen(last("lot").list), ["idle", "", []]);
    await act(() => pending.resolve());
    assert.deepEqual(seen(last("lot").list), ["idle", "", []]);
    await act(() => last("lot").list.open());
    assert.deepEqual(asked("lots").at(-1).key[3], { product: 3, warehouse: "south" });
    await act(() => asked("lots").at(-1).resolve());
    assert.deepEqual(
      last("lot").list.options.map((item) => item.label),
      ["Lot 1 of 3 in south", "Lot 2 of 3 in south"],
    );
    // The first row keeps its params: a view of it follows them again.
    await act(() => first.edit("warehouse", "center"));
    assert.equal(last("lot").list.status, "ready");
  } finally {
    await view.unmount();
  }
});

test("In StrictMode, a table with async row fields opens, adds, removes, and resets without duplicating requests or throwing", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => {
    errors.push(args);
  });
  const { open, asked } = setup();
  const { Field, last } = recording();
  const session = open([saved(1, "north"), saved(3, "south")]);
  function Lines() {
    const keys = useRows(session, "lines");
    return h(
      "div",
      null,
      keys.map((key) =>
        h(Field, { key, row: session.row("lines", key), name: "lot", label: `lot ${key}` }),
      ),
    );
  }
  const view = await mount(() => h(StrictMode, null, h(Lines)));
  try {
    const [first, second] = keysOf(session);
    await act(() => last(`lot ${first}`).list.open());
    const live = asked("lots").filter(({ signal }) => !signal.aborted);
    assert.equal(live.length, 1);
    await act(() => live[0].resolve());
    assert.equal(last(`lot ${first}`).list.status, "ready");
    const [added] = await act(() => session.add("lines", [saved(2, "north")]));
    await act(() => last(`lot ${added}`).list.open());
    assert.deepEqual(asked("lots").at(-1).key[3], { product: 2, warehouse: "north" });
    await act(() => session.remove("lines", [second]));
    await act(() => session.reset());
    assert.deepEqual(keysOf(session), [first, second]);
    assert.ok(asked("lots").at(-1).signal.aborted);
    assert.deepEqual(errors, []);
  } finally {
    await view.unmount();
  }
});

test("The binding requires the async renderer for async row fields", async () => {
  const definition = orderOf();
  const { Field, useFormSession } = createReactBinding({ text: input, number: input });
  const session = createSession(definition, { scope, initial: { lines: [{}] } });
  const line = session.row("lines", keysOf(session)[0]);
  const errors = [];
  const view = await mount(() =>
    h(Boundary, { errors }, h(Field, { row: line, name: "quantity" })),
  );
  try {
    assert.equal(errors[0].message, 'Field "product" of "lines" (async): missing renderer');
  } finally {
    await view.unmount();
  }
  function Editor() {
    useFormSession(definition, { scope });
    return null;
  }
  const failed = [];
  const editor = await mount(() => h(Boundary, { errors: failed }, h(Editor)));
  try {
    assert.equal(failed[0].message, 'Field "product" of "lines" (async): missing renderer');
  } finally {
    await editor.unmount();
  }
});
