import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { act, createElement as h, deferred, flush, mount } from "./helpers/react.mjs";
import { createQueryClient } from "./helpers/query.mjs";

const problem = new Error("Quantity cannot be negative");
const order = defineForm({
  fields: {
    quantity: field.number({ default: 2 }),
    price: field.number({ default: 10 }),
    total: field.number(),
  },
  rules: {
    total: {
      value: ({ quantity, price }) => {
        if (quantity < 0) throw problem;
        return quantity * price;
      },
    },
  },
});
const { Field, useFormSession } = createReactBinding({
  number: ({ name, value, onChange }) =>
    h("input", {
      name,
      value: value ?? "",
      onInput: (event) =>
        onChange(event.currentTarget.value === "" ? null : Number(event.currentTarget.value)),
    }),
});

test("TanStack Query and real renderers open with the prepared total, synchronize two views, and keep another session", async () => {
  const client = createQueryClient();
  const request = deferred();
  const other = createSession(order);
  let editor;
  function Editor() {
    const query = useQuery({ queryKey: ["calculated"], queryFn: () => request.promise });
    const currentEditor = useFormSession(order, { initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = currentEditor;
    });
    if (currentEditor.status !== "ready") return h("output", null, currentEditor.status);
    return h(
      "div",
      null,
      h(Field, { session: currentEditor.session, name: "quantity" }),
      h(Field, { session: currentEditor.session, name: "total" }),
      h(Field, { session: currentEditor.session, name: "total" }),
      h(Field, { session: other, name: "total" }),
    );
  }
  const view = await mount(() => h(QueryClientProvider, { client }, h(Editor)));
  const totals = () =>
    [...view.container.querySelectorAll('[name="total"]')].map((input) => input.value);
  const edit = (selector, value) =>
    act(() => {
      const input = view.container.querySelector(selector);
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  try {
    assert.equal(view.container.textContent, "loading");
    assert.equal("session" in editor, false);
    await act(() => request.resolve({ quantity: 2, price: 10, total: 17 }));
    await flush();
    assert.deepEqual(totals(), ["17", "17", "20"]);
    await edit('[name="total"]', "25");
    assert.deepEqual(totals(), ["25", "25", "20"]);
    await edit('[name="quantity"]', "3");
    assert.deepEqual(totals(), ["30", "30", "20"]);
    await act(() => editor.session.reset());
    assert.deepEqual(totals(), ["17", "17", "20"]);
  } finally {
    await view.unmount();
    client.clear();
  }
});

test("an initial failure uses TanStack Query error and retry, and each retry requests the data again", async () => {
  const client = createQueryClient();
  client.setQueryData(["failed-rule"], { quantity: -1, price: 10 }, { updatedAt: 1 });
  const requests = [];
  let editor;
  function Editor() {
    const query = useQuery({
      queryKey: ["failed-rule"],
      staleTime: Infinity,
      queryFn: () => {
        const request = deferred();
        requests.push(request);
        return request.promise;
      },
    });
    const currentEditor = useFormSession(order, { initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = currentEditor;
    });
    return h("output", null, currentEditor.status);
  }
  const view = await mount(() => h(QueryClientProvider, { client }, h(Editor)));
  try {
    assert.equal(editor.status, "error");
    assert.equal(editor.error.cause, problem);
    assert.equal("session" in editor, false);
    await act(() => editor.retry());
    assert.equal(editor.status, "loading");
    assert.equal(requests.length, 1);
    await act(() => requests[0].resolve({ quantity: -2, price: 10 }));
    await flush();
    assert.equal(editor.status, "error", "Retry does not fix a formula that keeps failing");
    assert.equal(editor.error.cause, problem);
    await act(() => editor.retry());
    assert.equal(requests.length, 2);
    await act(() => requests[1].resolve({ quantity: 2, price: 10 }));
    await flush();
    assert.equal(editor.status, "ready");
    assert.equal(editor.session.getSnapshot().values.total, 20);
    editor.session.edit("total", 25);
    editor.session.reset();
    assert.equal(editor.session.getSnapshot().values.total, 20);
  } finally {
    await view.unmount();
    client.clear();
  }
});

test("synchronous opening through the hook throws the rule failure without creating a partial session", async () => {
  await assert.rejects(
    mount(() => {
      useFormSession(order, { initial: { quantity: -1 } });
      return null;
    }),
    (error) => error.cause === problem && /total.*value/u.test(error.message),
  );
});
