import assert from "node:assert/strict";
import { test } from "node:test";
import { StrictMode, useLayoutEffect, useSyncExternalStore } from "react";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { createReactBinding, queryLoader } from "trama-forms/react";
import { createFreshClient } from "./helpers/query.mjs";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import { saved, scope } from "./helpers/rows-async.mjs";
import { handlesOf, priceOf, setup } from "./helpers/rows-queries.mjs";
import { settle } from "./helpers/scripted-loader.mjs";

// The queries of rows with React 19.3 and Query 5.96, both real; the suites of
// the cell use the scripted loader, a mock whose requests wait until the test
// settles them. The state of a row is read from its handle, with a selector.

const input = ({ name, value }) => h("output", { name }, String(value ?? ""));
// A status cell that records what it committed.
function cellOf(drawn) {
  return function PriceStatus({ line }) {
    const state = useSyncExternalStore(line.subscribe, () => line.getSnapshot()?.queries.price);
    useLayoutEffect(() => {
      drawn.push(state?.status);
    });
    if (state === undefined || state.status === "idle") return null;
    if (state.status === "pending") return h("output", null, "Querying…");
    return h(
      "span",
      { role: "alert" },
      state.error.message,
      h("button", { type: "button", onClick: () => line.retry("price") }, "Retry"),
    );
  };
}

test("A line's status cell follows its query and rerenders on its own when the state changes, leaving the price field untouched", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2)]);
  const [first, second] = handlesOf(session);
  const drawn = { first: [], second: [], price: [] };
  function PriceInput({ value }) {
    useLayoutEffect(() => {
      drawn.price.push(value);
    });
    return input({ name: "price", value });
  }
  const { Field } = createReactBinding({ number: PriceInput, text: input, async: () => null });
  const [First, Second] = [cellOf(drawn.first), cellOf(drawn.second)];
  const view = await mount(() =>
    h(
      "div",
      null,
      h(First, { line: first }),
      h(Second, { line: second }),
      h(Field, { row: first, name: "price" }),
    ),
  );
  try {
    assert.equal(view.container.textContent, "Querying…Querying…");
    await act(() => prices(2)[0].reject(new Error("No network")));
    assert.match(view.container.textContent, /^Querying….*request failed: No networkRetry$/u);
    assert.deepEqual([drawn.first, drawn.second], [["pending"], ["pending", "error"]]);
    await act(() => view.container.querySelector("button").click());
    assert.deepEqual(drawn.second, ["pending", "error", "pending"]);
    await act(() => prices(2)[1].resolve());
    await act(() => prices(1)[0].resolve());
    assert.deepEqual(drawn.first, ["pending", "idle"]);
    assert.equal(view.container.textContent, "100");
    // The price drew its first value and the answer, never the states.
    assert.deepEqual(drawn.price, [null, 100]);
  } finally {
    await view.unmount();
  }
});

// An order whose lines ask for their price from an endpoint that counts its
// loads, the transports that reach the simulated server.
const counted = () => {
  const loads = [];
  const catalog = defineEndpoints({
    linePrice: endpoint.value((request, params) => {
      loads.push(params);
      return Promise.resolve(priceOf(params));
    }),
  });
  const { defineForm, field } = createForms({ endpoints: [catalog] });
  const definition = defineForm({
    fields: { priceList: field.text({ default: "retail" }) },
    collections: { lines: { fields: { product: field.number(), price: field.number() } } },
    rules: {
      lines: {
        each: {
          price: {
            query: {
              endpoint: "linePrice",
              params: ({ product }, { values }) =>
                product === null ? undefined : { product, list: values.priceList },
            },
          },
        },
      },
    },
  });
  return { definition, loads };
};

// Mounts an editor of one line with StrictMode as the root, which renders it
// twice, so the binding creates a candidate session. Gives how many loads the
// endpoint ran and the price of the published session.
async function strictOpen(options) {
  const { definition, loads } = counted();
  const { useFormSession } = createReactBinding({ number: () => null, text: () => null }, options);
  let editor;
  function Editor() {
    const current = useFormSession(definition, { scope, initial: { lines: [{ product: 1 }] } });
    useLayoutEffect(() => {
      editor = current;
    });
    return null;
  }
  const view = await mount(StrictMode, { children: h(Editor) });
  try {
    await act(() => settle());
    return [loads.length, editor.session.getSnapshot().values.lines[0].price];
  } finally {
    await view.unmount();
  }
}

test("In StrictMode, an opening line is requested twice with the direct loader, once per candidate session, and once with queryLoader", async () => {
  const client = createFreshClient();
  try {
    assert.deepEqual(await strictOpen(), [2, 100]);
    assert.deepEqual(await strictOpen({ loader: queryLoader(client) }), [1, 100]);
  } finally {
    client.clear();
  }
});

test("With actual TanStack Query, 1,000 lines with 50 distinct params make 50 transport requests and make none with a fresh cache", async () => {
  const { definition, loads } = counted();
  const client = createFreshClient();
  const loader = queryLoader(client);
  const lines = Array.from({ length: 1000 }, (_, index) => ({ product: 1 + (index % 50) }));
  try {
    const session = createSession(definition, { scope, loader, initial: { lines } });
    await settle();
    assert.equal(loads.length, 50);
    const prices = session.getSnapshot().values.lines.map(({ price }) => price);
    assert.deepEqual([prices[0], prices[49], prices[999]], [100, 5000, 5000]);
    const again = createSession(definition, { scope, loader, initial: { lines } });
    await settle();
    assert.equal(loads.length, 50);
    assert.equal(again.getSnapshot().values.lines[50].price, 100);
  } finally {
    client.clear();
  }
});
