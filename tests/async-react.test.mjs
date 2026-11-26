import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { createReactBinding, queryLoader } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import { pageOf, scriptedLoader } from "./helpers/scripted-loader.mjs";

const rows = ["Acme", "Atlas", "Beta", "Boreal"].map((label, index) => ({
  value: index + 1,
  label,
}));
// Every request the endpoint received, with its scope.
const requests = [];
const sales = defineEndpoints({
  customers: endpoint.options((request) => {
    requests.push(request);
    return Promise.resolve(pageOf(rows, request));
  }),
});
const { defineForm, field } = createForms({ endpoints: [sales] });
// Each checkbox hides, disables or freezes the customer.
const order = defineForm({
  fields: {
    customer: field.async("customers", { placeholder: "Search customers" }),
    hide: field.checkbox(),
    disable: field.checkbox(),
    freeze: field.checkbox(),
  },
  rules: {
    customer: {
      hidden: ({ hide }) => hide,
      disabled: ({ disable }) => disable,
      readOnly: ({ freeze }) => freeze,
    },
  },
});

// The async renderer records the props it committed; the label of the view
// tells two views of the same field apart.
function recording(options) {
  const renders = [];
  function Remote(props) {
    useLayoutEffect(() => {
      renders.push(props);
    });
    return h("output", { name: props.name }, props.list.status);
  }
  const binding = createReactBinding({ checkbox: () => null, async: Remote }, options);
  const last = (label) => renders.findLast((props) => props.label === label);
  return { ...binding, renders, last };
}
const seen = (list) => [list.status, list.text, list.options.map((option) => option.label)];
const actions = (list) => [list.open, list.search, list.more, list.retry];
// Records the name of each option list the session creates.
const spyLists = (session) => {
  const created = [];
  const { list } = session;
  session.list = (name) => {
    created.push(name);
    return list(name);
  };
  return created;
};

test("Two views of the same field search separately and their lists do not write to the session", async () => {
  const { loader, calls } = scriptedLoader();
  const { Field, last } = recording();
  const session = createSession(order, { scope: "acme", loader });
  const before = session.getSnapshot();
  const view = await mount(() =>
    h(
      "div",
      null,
      ["A", "B"].map((label) => h(Field, { key: label, session, name: "customer", label })),
    ),
  );
  try {
    assert.deepEqual(
      [seen(last("A").list), seen(last("B").list)],
      [
        ["idle", "", []],
        ["idle", "", []],
      ],
    );
    await act(() => last("A").list.search("at"));
    await act(() => last("B").list.open());
    assert.deepEqual(
      calls.map(({ key }) => key.slice(4)),
      [
        ["at", 1],
        ["", 1],
      ],
    );
    await act(() => calls[1].resolve());
    assert.deepEqual(
      [seen(last("A").list), seen(last("B").list)],
      [
        ["loading", "at", []],
        ["ready", "", ["Acme", "Atlas"]],
      ],
    );
    await act(() => calls[0].resolve());
    assert.deepEqual(seen(last("A").list), ["ready", "at", ["Atlas"]]);
    assert.deepEqual(seen(last("B").list), ["ready", "", ["Acme", "Atlas"]]);
    assert.equal(session.getSnapshot(), before);
  } finally {
    await view.unmount();
  }
});

test("A field creates its list when shown and stops requesting when hidden, with no list created while initially hidden", async () => {
  const { loader, calls } = scriptedLoader();
  const { Field, renders, last } = recording();
  const session = createSession(order, { scope: "acme", loader, initial: { hide: true } });
  const created = spyLists(session);
  const view = await mount(() => h(Field, { session, name: "customer" }));
  try {
    assert.deepEqual([created, renders.length], [[], 0]);
    await act(() => session.edit("hide", false));
    assert.deepEqual(created, ["customer"]);
    assert.deepEqual(seen(last().list), ["idle", "", []]);
    await act(() => last().list.open());
    assert.equal(calls.length, 1);
    await act(() => session.edit("hide", true));
    assert.equal(calls[0].signal.aborted, true);
    await act(() => session.edit("hide", false));
    assert.deepEqual(created, ["customer", "customer"]);
    assert.deepEqual(seen(last().list), ["idle", "", []]);
    assert.equal(calls.length, 1);
  } finally {
    await view.unmount();
  }
});

test("The binding ignores the async renderer's onChange while the field is disabled or read-only, and list actions keep working", async () => {
  const { loader, calls } = scriptedLoader();
  const { Field, last } = recording();
  const session = createSession(order, { scope: "acme", loader });
  const view = await mount(() => h(Field, { session, name: "customer" }));
  const chosen = () => session.getSnapshot().values.customer?.label ?? null;
  try {
    await act(() => last().list.open());
    await act(() => calls[0].resolve());
    const [acme, atlas] = last().list.options;
    const editable = last().onChange;
    await act(() => editable(acme));
    assert.equal(chosen(), "Acme");
    await act(() => session.edit("disable", true));
    assert.equal(last().disabled, true);
    await act(() => editable(atlas));
    await act(() => last().onChange(null));
    assert.equal(
      chosen(),
      "Acme",
      "disabled ignores onChange, including a previously captured handler",
    );
    await act(() => last().list.search("b"));
    await act(() => calls[1].reject(new Error("Outage")));
    assert.equal(last().list.status, "error");
    await act(() => last().list.retry());
    await act(() => calls[2].resolve());
    assert.deepEqual(seen(last().list), ["ready", "b", ["Beta", "Boreal"]]);
    await act(() => session.edit("disable", false));
    await act(() => session.edit("freeze", true));
    assert.equal(last().readOnly, true);
    await act(() => last().onChange(atlas));
    assert.equal(chosen(), "Acme", "readOnly ignores onChange");
    await act(() => last().list.search(""));
    await act(() => calls[3].resolve());
    await act(() => last().list.more());
    await act(() => calls[4].resolve());
    assert.deepEqual(seen(last().list), ["ready", "", ["Acme", "Atlas", "Beta", "Boreal"]]);
    await act(() => session.edit("freeze", false));
    await act(() => last().onChange(atlas));
    assert.equal(chosen(), "Atlas");
  } finally {
    await view.unmount();
  }
});

test("List actions keep their identity across renders as the snapshot and field change", async () => {
  const { loader, calls } = scriptedLoader();
  const { Field, renders, last } = recording();
  const session = createSession(order, { scope: "acme", loader });
  const view = await mount(() => h(Field, { session, name: "customer" }));
  try {
    const first = last().list;
    await act(() => first.search("a"));
    await act(() => calls[0].resolve());
    await act(() => session.edit("customer", last().list.options[0]));
    await act(() => session.edit("disable", true));
    assert.notEqual(last().list, first);
    assert.deepEqual(
      [...new Set(renders.map(({ list }) => list.status))],
      ["idle", "loading", "ready"],
    );
    for (const props of renders)
      actions(props.list).forEach((action, index) => {
        assert.equal(action, actions(first)[index]);
      });
  } finally {
    await view.unmount();
  }
});

test("useFormSession passes the binding's scope and loader to the session. -0 and 0 are the same scope, and a different key allows a different scope", async () => {
  const { loader, calls } = scriptedLoader();
  const { useFormSession } = recording({ loader });
  let editor;
  const view = await mount(
    ({ id, scope }) => {
      editor = useFormSession(order, { key: id, scope });
      return null;
    },
    { id: "A", scope: 0 },
  );
  // Opens a view of the session and answers its request: the key and the scope
  // that the endpoint received.
  const request = async (session) => {
    const list = session.list("customer");
    const stop = list.subscribe(() => {});
    list.open();
    await calls.at(-1).resolve();
    stop();
    return [calls.at(-1).key, requests.at(-1).scope];
  };
  try {
    const first = editor.session;
    await view.render({ id: "A", scope: -0 });
    assert.equal(editor.session, first);
    assert.deepEqual(await request(first), [["trama", 0, "customers", {}, "", 1], 0]);
    await view.render({ id: "B", scope: "other" });
    assert.notEqual(editor.session, first);
    assert.deepEqual(await request(editor.session), [
      ["trama", "other", "customers", {}, "", 1],
      "other",
    ]);
    await assert.rejects(view.render({ id: "B", scope: "third" }), {
      message: "Changing scope requires a different session key",
    });
  } finally {
    await view.unmount();
  }
  await assert.rejects(
    mount(() => {
      useFormSession(order, {});
      return null;
    }),
    { message: "Form with async fields requires a scope" },
  );
});

test("Binding options are validated when the binding is created, and queryLoader requires a QueryClient", () => {
  const renderers = { checkbox: () => null };
  const { loader } = scriptedLoader();
  for (const key of ["x", "lodaer"])
    assert.throws(() => createReactBinding(renderers, { loader, [key]: loader }), {
      message: `Binding options: unknown property "${key}"`,
    });
  for (const options of [5, "loader", null, []])
    assert.throws(() => createReactBinding(renderers, options), {
      message: "Binding options must be an object",
    });
  for (const invalid of [5, "loader", null, {}])
    assert.throws(() => createReactBinding(renderers, { loader: invalid }), {
      message: "Binding loader must be a function",
    });
  for (const options of [undefined, {}, { loader: undefined }, { loader }])
    assert.equal(typeof createReactBinding(renderers, options).useFormSession, "function");
  for (const client of [undefined, null, {}, { fetchQuery: 1 }])
    assert.throws(() => queryLoader(client), { message: "queryLoader requires a QueryClient" });
});
