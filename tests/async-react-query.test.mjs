import assert from "node:assert/strict";
import { test } from "node:test";
import { hashKey } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { createReactBinding, queryLoader } from "trama-forms/react";
import { createElement as h, mount } from "./helpers/react.mjs";
import { createFreshClient } from "./helpers/query.mjs";
import { opened, pageOf, settle } from "./helpers/scripted-loader.mjs";

// The customers the server holds; a test may change one between requests.
const rows = () =>
  ["Acme", "Atlas", "Beta", "Boreal"].map((label, index) => ({ value: index + 1, label }));
let catalog = rows();
// Every request the endpoints received.
const loads = [];
const sales = defineEndpoints({
  customers: endpoint.options((request) => {
    loads.push(request);
    return Promise.resolve(pageOf(catalog, request));
  }),
  // Its only contact names the params it was asked with.
  contacts: endpoint.list((request, params) => {
    loads.push(request);
    return Promise.resolve([{ value: 1, label: JSON.stringify(params) }]);
  }),
});
// Pairs of params that the hashKey of TanStack Query cannot tell apart.
const probes = {
  null: { x: [null] },
  hole: { x: [undefined] },
  empty: {},
  proto: JSON.parse('{ "__proto__": 1 }'),
};
const { defineForm, field } = createForms({ endpoints: [sales] });
const order = defineForm({
  fields: {
    customer: field.async("customers"),
    contact: field.async("contacts"),
    probe: field.text(),
  },
  rules: { contact: { params: ({ probe }) => probes[probe] } },
});

// A session asks through a client like the guide's: the options of Trama stay
// fresh, so reopening a list reads the TanStack Query cache instead of the server.
const start = () => {
  catalog = rows();
  loads.length = 0;
  const client = createFreshClient();
  return { client, loader: queryLoader(client) };
};
// Opens a view of the field with one subscriber and waits for its answer.
const settled = async (session, name = "customer") => {
  const view = opened(session, name);
  await settle();
  return view;
};
const labels = (view) => view.getSnapshot().options.map((option) => option.label);
const frozen = (value) =>
  typeof value !== "object" ||
  value === null ||
  (Object.isFrozen(value) && Object.values(value).every((item) => frozen(item)));
const hash = (params) => hashKey(["trama", "acme", "contacts", params]);
const sameOptions = (a, b) => {
  const [left, right] = [a, b].map((view) => view.getSnapshot().options);
  return left.length === right.length && left.every((option, index) => option === right[index]);
};

test("Two sessions with the same scope share the TanStack Query cache with one request. A different scope uses a different key and request", async () => {
  const { client, loader } = start();
  try {
    const first = await settled(createSession(order, { scope: "acme", loader }));
    const second = await settled(createSession(order, { scope: "acme", loader }));
    assert.deepEqual(labels(first), ["Acme", "Atlas"]);
    assert.equal(loads.length, 1);
    assert.equal(sameOptions(first, second), true);
    const other = await settled(createSession(order, { scope: "other", loader }));
    assert.deepEqual(labels(other), ["Acme", "Atlas"]);
    assert.deepEqual(
      loads.map(({ scope }) => scope),
      ["acme", "other"],
    );
    assert.deepEqual(
      client
        .getQueryCache()
        .getAll()
        .map(({ queryKey }) => queryKey),
      [
        ["trama", "acme", "customers", {}, "", 1],
        ["trama", "other", "customers", {}, "", 1],
      ],
    );
  } finally {
    client.clear();
  }
});

test("A refetch with partial changes returns frozen options that another session reads from the cache", async () => {
  const { client, loader } = start();
  try {
    const view = await settled(createSession(order, { scope: "acme", loader }));
    // One option changes and the other stays equal as data.
    catalog[1] = { ...catalog[1], label: "Atlas South" };
    await client.invalidateQueries({ queryKey: ["trama"] });
    view.open();
    await settle();
    const cached = await settled(createSession(order, { scope: "acme", loader }));
    assert.equal(loads.length, 2);
    for (const current of [view, cached]) {
      assert.deepEqual(labels(current), ["Acme", "Atlas South"]);
      assert.equal(frozen(current.getSnapshot().options), true);
    }
    assert.equal(sameOptions(view, cached), true);
  } finally {
    client.clear();
  }
});

test("params with undefined in an array or the __proto__ key are rejected, so they never share the entry that TanStack Query hashes to the same key", async () => {
  const { client, loader } = start();
  const open = (probe) => createSession(order, { scope: "acme", loader, initial: { probe } });
  try {
    assert.equal(hash(probes.hole), hash(probes.null));
    assert.equal(hash(probes.proto), hash(probes.empty));
    const session = open("null");
    const nulls = await settled(session, "contact");
    const empty = await settled(open("empty"), "contact");
    assert.deepEqual([labels(nulls), labels(empty)], [['{"x":[null]}'], ["{}"]]);
    for (const [probe, detail] of [
      ["hole", 'undefined is not allowed inside arrays at "x[0]"'],
      ["proto", '"__proto__" is not allowed as a key'],
    ]) {
      const message = `Field "contact" params: ${detail}`;
      assert.throws(() => open(probe), { message });
      assert.throws(() => session.edit("probe", probe), { message });
    }
    assert.equal(session.getSnapshot().values.probe, "null");
    assert.deepEqual(labels(nulls), ['{"x":[null]}']);
    assert.equal(loads.length, 2);
    assert.deepEqual(
      client
        .getQueryCache()
        .getAll()
        .map(({ queryHash }) => queryHash),
      [hash(probes.null), hash(probes.empty)],
    );
  } finally {
    client.clear();
  }
});

// Opens its list from an effect, as a combo that loads when it mounts.
function Opener({ list }) {
  const { open } = list;
  useEffect(() => {
    open();
  }, [open]);
  return h("output", null, `${list.status}: ${list.options.map(({ label }) => label).join(", ")}`);
}

// Mounts the order in StrictMode, as the root of what mounts: it replays effects
// only then. Gives whether each request of the endpoint was aborted, and the view.
async function strictOpen(options) {
  loads.length = 0;
  const { Field, useFormSession } = createReactBinding(
    { text: () => null, async: Opener },
    options,
  );
  function Editor() {
    const editor = useFormSession(order, { scope: "acme" });
    return editor.status === "ready"
      ? h(Field, { session: editor.session, name: "customer" })
      : null;
  }
  const view = await mount(StrictMode, { children: h(Editor) });
  try {
    return [loads.map(({ signal }) => signal.aborted), view.container.textContent];
  } finally {
    await view.unmount();
  }
}

test("In StrictMode, an open from a renderer effect repeats with the direct loader and is deduplicated with queryLoader", async () => {
  const { client, loader } = start();
  try {
    // Direct: StrictMode unsubscribes, which aborts the first request, and asks again.
    assert.deepEqual(await strictOpen({}), [[true, false], "ready: Acme, Atlas"]);
    assert.deepEqual(await strictOpen({ loader }), [[false], "ready: Acme, Atlas"]);
  } finally {
    client.clear();
  }
});
