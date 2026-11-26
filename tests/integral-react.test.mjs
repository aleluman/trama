import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createSession } from "trama-forms/core";
import {
  createReactBinding,
  initialFromQuery,
  OutputBoundary,
  useOutputs,
} from "trama-forms/react";
import { order } from "../docs/site/examples/complete/order.ts";
import { act, createElement as h, deferred, flush, mount } from "./helpers/react.mjs";
import { createQueryClient } from "./helpers/query.mjs";

// The customers of the order come from an endpoint, so its sessions need a scope,
// and every session needs its context: the mode, today and the currency.
const scope = "demo";
const context = {
  mode: "edit",
  today: "2026-09-27",
  currency: { code: "JPY", taxRate: 0.2 },
};
const loaded = {
  quantity: 0,
  total: 9500,
  city: "Barcelona",
  includeNote: false,
  note: "Saved",
};

test("the complete example opens from TanStack Query with values, state, and derived outputs ready and restores both views", async () => {
  const original = console.error;
  console.error = () => {};
  const { request, client, view, getEditor, getPrepared } = await setup();
  const totals = () =>
    [...view.container.querySelectorAll('[name="total"]')].map((input) => input.value);
  const notes = () =>
    [...view.container.querySelectorAll('[name="note"]')]
      .map((input) => `${input.value}:${input.disabled}`)
      .join("|");
  try {
    assert.equal(getEditor().status, "loading");
    assert.equal("session" in getEditor(), false);
    await act(() => view.container.querySelector("button").click());
    await act(() => request.resolve(loaded));
    await flush();
    assert.equal(getEditor().status, "ready");
    const session = getEditor().session;
    const prepared = getPrepared();
    assert.equal(prepared.snapshot.values.total, 9500);
    assert.equal(prepared.snapshot.values.city, "Barcelona");
    assert.equal(prepared.snapshot.fieldStates.note.disabled, true);
    assert.equal(prepared.caption, "Total: 11400 JPY");
    assert.deepEqual(totals(), ["9500", "9500", "10000"]);
    assert.equal(notes(), "Saved:true|Saved:true");
    assert.match(view.container.textContent, /Screen 1Unit price failedTotal: 11400 JPY/u);
    await act(() => view.container.querySelector('[name="includeNote"]').click());
    assert.equal(notes(), "Saved:false|Saved:false");
    await act(() => session.edit("quantity", 2));
    assert.deepEqual(totals(), ["10000", "10000", "10000"]);
    assert.match(view.container.textContent, /5000\.00 JPY per unitTotal: 12000 JPY/u);
    await act(() => session.edit("country", "MX"));
    assert.equal(session.getSnapshot().values.city, "");
    await act(() => client.setQueryData(["integral"], { total: 999 }));
    await act(() => session.reset());
    assert.equal(getEditor().session, session);
    assert.deepEqual(totals(), ["9500", "9500", "10000"]);
    assert.equal(notes(), "Saved:true|Saved:true");
    assert.equal(session.getSnapshot().values.city, "Barcelona");
    assert.match(view.container.textContent, /Screen 1Unit price failedTotal: 11400 JPY/u);
  } finally {
    await view.unmount();
    client.clear();
    console.error = original;
  }
});

const { Field, useFormSession } = createReactBinding({
  text: ({ name, value, disabled }) => h("input", { name, value, disabled, readOnly: true }),
  number: ({ name, value, onChange }) =>
    h("input", {
      name,
      value: value ?? "",
      onInput: (event) => onChange(Number(event.currentTarget.value)),
    }),
  checkbox: ({ name, value, onChange }) =>
    h("input", {
      name,
      type: "checkbox",
      checked: value,
      onChange: (event) => onChange(event.currentTarget.checked),
    }),
  select: () => null,
  async: ({ name, value }) => h("output", { name }, value?.label ?? ""),
});

function Summary({ session }) {
  const { unitCaption } = useOutputs(session);
  return h("output", null, unitCaption);
}

function Caption({ session }) {
  const { caption } = useOutputs(session);
  return h("output", null, caption);
}

function Views({ session }) {
  return h(
    "div",
    null,
    h(Field, { session: session, name: "quantity" }),
    h(Field, { session: session, name: "includeNote" }),
    ...["main", "mirror"].map((key) =>
      h(
        "fieldset",
        { key },
        h(Field, { session: session, name: "total" }),
        h(Field, { session: session, name: "note" }),
      ),
    ),
    h(
      OutputBoundary,
      { session: session, fallback: "Unit price failed" },
      h(Summary, { session: session }),
    ),
    h(Caption, { session: session }),
  );
}

async function setup() {
  const request = deferred();
  const client = createQueryClient();
  const other = createSession(order, { scope, context });
  let editor;
  let prepared;
  function Editor() {
    const [screen, setScreen] = useState(0);
    const query = useQuery({
      queryKey: ["integral"],
      queryFn: () => request.promise,
      staleTime: Infinity,
    });
    const current = useFormSession(order, { scope, context, initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = current;
      if (current.status === "ready" && !prepared) {
        current.session.watchOutputs(({ caption }) => {
          prepared = { snapshot: current.session.getSnapshot(), caption };
        })();
      }
    });
    return h(
      "section",
      null,
      h("button", { onClick: () => setScreen(screen + 1) }, `Screen ${screen}`),
      current.status === "ready" && h(Views, { session: current.session }),
      h(Field, { session: other, name: "total" }),
    );
  }
  const view = await mount(() => h(QueryClientProvider, { client }, h(Editor)));
  return { request, client, view, getEditor: () => editor, getPrepared: () => prepared };
}
