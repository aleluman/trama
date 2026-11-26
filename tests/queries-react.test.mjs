import assert from "node:assert/strict";
import { test } from "node:test";
import { StrictMode, useLayoutEffect } from "react";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { createReactBinding, queryLoader } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import { createFreshClient } from "./helpers/query.mjs";
import { scriptedLoader, settle } from "./helpers/scripted-loader.mjs";

// Value queries with React 19.3 and TanStack Query 5.96, both real: queryLoader shares
// the cache of a real QueryClient. Only the test of the renderer uses the
// scripted loader, a mock whose requests wait until the test settles them.

// A form whose price is asked for by customer. loads records each request its
// endpoint received, with the scope.
const priced = () => {
  const loads = [];
  const catalog = defineEndpoints({
    unitPrice: endpoint.value((request, { customer }) => {
      loads.push(request);
      return Promise.resolve(1000 + 100 * customer);
    }),
  });
  const { defineForm, field } = createForms({ endpoints: [catalog] });
  const definition = defineForm({
    fields: { customer: field.number(), price: field.number({ default: 5000 }) },
    rules: {
      price: {
        query: {
          endpoint: "unitPrice",
          params: ({ customer }) => (customer === null ? undefined : { customer }),
        },
      },
    },
  });
  return { definition, loads };
};
const priceOf = (session) => {
  const { values, queries } = session.getSnapshot();
  return [values.price, queries.price.status];
};

test("With real TanStack Query, two sessions with the same scope and params make one request. A different scope or different params make a separate request", async () => {
  const { definition, loads } = priced();
  const client = createFreshClient();
  const loader = queryLoader(client);
  const open = (scope, customer = 1) =>
    createSession(definition, { scope, loader, initial: { customer } });
  try {
    // Both ask before any answer: TanStack Query shares the request in flight.
    const sessions = [open("acme"), open("acme")];
    await settle();
    assert.equal(loads.length, 1);
    // Once answered, another session of the scope reads the TanStack Query cache.
    sessions.push(open("acme"));
    await settle();
    for (const session of sessions) assert.deepEqual(priceOf(session), [1100, "idle"]);
    assert.equal(loads.length, 1);
    const others = [open("other"), open("acme", 2)];
    await settle();
    assert.deepEqual(
      others.map((session) => priceOf(session)),
      [
        [1100, "idle"],
        [1200, "idle"],
      ],
    );
    assert.deepEqual(
      loads.map(({ scope }) => scope),
      ["acme", "other", "acme"],
    );
    assert.deepEqual(
      client
        .getQueryCache()
        .getAll()
        .map(({ queryKey }) => queryKey),
      [
        ["trama", "acme", "unitPrice", { customer: 1 }],
        ["trama", "other", "unitPrice", { customer: 1 }],
        ["trama", "acme", "unitPrice", { customer: 2 }],
      ],
    );
  } finally {
    client.clear();
  }
});

// Mounts an editor of customer 1 with StrictMode as the root, which renders it
// twice, so the binding creates a candidate session. Gives how many requests the
// endpoint received and the price of the published session.
async function strictOpen(options) {
  const { definition, loads } = priced();
  const { useFormSession } = createReactBinding({ number: () => null }, options);
  let editor;
  function Editor() {
    const current = useFormSession(definition, { scope: "acme", initial: { customer: 1 } });
    useLayoutEffect(() => {
      editor = current;
    });
    return null;
  }
  const view = await mount(StrictMode, { children: h(Editor) });
  try {
    return [loads.length, priceOf(editor.session)];
  } finally {
    await view.unmount();
  }
}

test("In StrictMode, the opening query is requested twice with the direct loader, once per candidate session, and once with queryLoader", async () => {
  const client = createFreshClient();
  try {
    assert.deepEqual(await strictOpen(), [2, [1100, "idle"]]);
    assert.deepEqual(await strictOpen({ loader: queryLoader(client) }), [1, [1100, "idle"]]);
  } finally {
    client.clear();
  }
});

test("The price renderer rerenders with the value written by the response and skips state-only changes", async () => {
  const { definition } = priced();
  const { loader, calls } = scriptedLoader();
  const drawn = [];
  function NumberInput({ value }) {
    useLayoutEffect(() => {
      drawn.push(value);
    });
    return h("output", null, String(value));
  }
  const { Field } = createReactBinding({ number: NumberInput });
  const session = createSession(definition, { scope: "acme", loader, initial: { customer: 1 } });
  const view = await mount(() => h(Field, { session, name: "price" }));
  try {
    assert.equal(view.container.textContent, "5000");
    await act(() => calls[0].resolve());
    assert.equal(view.container.textContent, "1100");
    // retry publishes only the state of the query: the props of the renderer do not change.
    await act(() => session.retry("price"));
    assert.equal(session.getSnapshot().queries.price.status, "pending");
    assert.deepEqual(drawn, [5000, 1100]);
  } finally {
    await view.unmount();
  }
});

test("With real TanStack Query, an undefined result leaves the query idle without writing, including from the cache", async () => {
  const { defineForm, field } = createForms({
    endpoints: [defineEndpoints({ optional: endpoint.value(async () => {}) })],
  });
  const definition = defineForm({
    fields: { price: field.number({ default: 42 }) },
    rules: { price: { query: { endpoint: "optional" } } },
  });
  const client = createFreshClient();
  try {
    const loader = queryLoader(client);
    const first = createSession(definition, { scope: "acme", loader });
    await settle();
    // The second reads what the TanStack Query cache keeps for undefined.
    const second = createSession(definition, { scope: "acme", loader });
    await settle();
    for (const session of [first, second]) assert.deepEqual(priceOf(session), [42, "idle"]);
  } finally {
    client.clear();
  }
});
