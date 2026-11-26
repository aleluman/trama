import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

// Two async fields whose endpoints name themselves in their only option.
const requests = [];
const { defineForm, field } = createForms({
  endpoints: [
    defineEndpoints(
      Object.fromEntries(
        ["a", "b"].map((name) => [
          name,
          endpoint.list(() => {
            requests.push(name);
            return Promise.resolve([{ value: name, label: name.toUpperCase() }]);
          }),
        ]),
      ),
    ),
  ],
});
const form = defineForm({ fields: { a: field.async("a"), b: field.async("b") } });

test("A Field that switches from one async field to another opens the new field's list", async () => {
  requests.length = 0;
  const session = createSession(form, { scope: "acme" });
  let props;
  function Renderer(next) {
    useLayoutEffect(() => {
      props = next;
    });
    return null;
  }
  const { Field } = createReactBinding({ async: Renderer });
  const view = await mount(({ name }) => h(Field, { session, name }), { name: "a" });
  try {
    await act(() => props.list.open());
    assert.deepEqual(
      props.list.options.map((option) => option.label),
      ["A"],
    );
    await view.render({ name: "b" });
    await act(() => props.list.open());
    assert.equal(props.name, "b");
    assert.deepEqual(
      props.list.options.map((option) => option.label),
      ["B"],
    );
    assert.deepEqual(requests, ["a", "b"]);
  } finally {
    await view.unmount();
  }
});

// The editor of the form, opened from a fresh query with the given scope.
const openedWith = async (scope) => {
  const { useFormSession } = createReactBinding({ async: () => null });
  const query = {
    data: { a: null },
    error: null,
    status: "success",
    isEnabled: true,
    isStale: false,
    isPlaceholderData: false,
    dataUpdatedAt: 1,
    refetch: () => assert.fail("a fresh query is not refetched"),
  };
  let editor;
  function Editor() {
    const current = useFormSession(form, { scope, initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = current;
    });
    return null;
  }
  const view = await mount(Editor);
  await view.render();
  await view.unmount();
  return editor;
};

test("An invalid scope with initial from a query is an opening error, including NaN", async () => {
  const message = "Session scope must be a string or a finite number";
  const infinite = await openedWith(Infinity);
  assert.equal(infinite.status, "error");
  assert.equal(infinite.error.message, message);
  const notANumber = await openedWith(Number.NaN);
  assert.equal(notANumber.status, "error");
  assert.equal(notANumber.error.message, message);
});
