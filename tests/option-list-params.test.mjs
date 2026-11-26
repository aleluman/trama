import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { pageOf, scriptedLoader, shown, watch } from "./helpers/scripted-loader.mjs";

const ana = { value: 1, label: "Ana" };
const beto = { value: 2, label: "Beto" };
// The contacts of each customer, and the customers of every region.
const contacts = {
  1: [
    { value: 11, label: "Beatriz" },
    { value: 12, label: "Carlos" },
  ],
  2: [
    { value: 21, label: "Bernardo" },
    { value: 22, label: "Diana" },
  ],
};
const customers = ["Ana", "Andrew", "Antonia", "Beto"].map((label, index) => ({
  value: index + 1,
  label,
}));

// The contacts of the chosen customer come from a full list; the customers of
// the region, from a paged endpoint. Rules may replace the params of both.
const setup = (rules, initial) => {
  const sales = defineEndpoints({
    customers: endpoint.options((request) => Promise.resolve(pageOf(customers, request))),
    contacts: endpoint.list((_, { customer }) => Promise.resolve(contacts[customer])),
  });
  const { defineForm, field } = createForms({ endpoints: [sales] });
  const definition = defineForm({
    fields: {
      customer: field.async("customers"),
      contact: field.async("contacts"),
      region: field.text(),
      note: field.text(),
    },
    rules: {
      contact: {
        params: ({ customer }) => (customer === null ? undefined : { customer: customer.value }),
      },
      customer: { params: ({ region }) => ({ region }) },
      ...rules,
    },
  });
  const { loader, calls } = scriptedLoader();
  return { session: createSession(definition, { scope: "acme", loader, initial }), calls };
};
const suspended = (text = "") => ({
  status: "suspended",
  text,
  labels: [],
  complete: false,
  error: undefined,
});

test("Without a customer, the contacts view is suspended and makes no request. Selecting a customer reloads it if it was open", async () => {
  const { session, calls } = setup();
  const { view } = watch(session, "contact");
  const closed = watch(session, "contact").view;
  assert.deepEqual(view.getSnapshot(), {
    status: "suspended",
    text: "",
    options: [],
    complete: false,
    error: undefined,
  });
  view.open();
  view.search("be");
  view.more();
  view.retry();
  assert.equal(calls.length, 0);
  assert.deepEqual(shown(view), suspended("be"));
  session.edit("customer", ana);
  assert.equal(calls.length, 1, "Only the open view makes a request");
  assert.deepEqual(calls[0].key, ["trama", "acme", "contacts", { customer: 1 }]);
  assert.equal(shown(view).status, "loading");
  assert.equal(shown(closed).status, "idle");
  await calls[0].resolve();
  const ready = { status: "ready", text: "be", complete: true, error: undefined };
  assert.deepEqual(shown(view), { ...ready, labels: ["Beatriz"] });
});

test("An in-flight response for earlier params is discarded, and suspending again aborts and clears the view while preserving the text", async () => {
  const { session, calls } = setup({}, { customer: ana });
  const watched = watch(session, "contact");
  const { view } = watched;
  view.open();
  session.edit("customer", beto);
  assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(calls[1].key, ["trama", "acme", "contacts", { customer: 2 }]);
  assert.deepEqual(shown(view), { ...suspended(), status: "loading" });
  await calls[0].resolve();
  assert.equal(shown(view).status, "loading");
  await calls[1].resolve();
  view.search("di");
  const ready = { status: "ready", complete: true, error: undefined };
  assert.deepEqual(shown(view), { ...ready, text: "di", labels: ["Diana"] });
  session.edit("customer", null);
  assert.deepEqual(shown(view), suspended("di"));
  session.edit("customer", ana);
  session.edit("customer", null);
  assert.equal(calls[2].signal.aborted, true);
  const before = view.getSnapshot();
  const notifications = watched.notifications;
  await calls[2].resolve();
  assert.equal(view.getSnapshot(), before);
  assert.equal(watched.notifications, notifications);
  assert.equal(calls.length, 3);
});

test("Changing params in an open option list view discards its pages and requests page 1 with the same text", async () => {
  const { session, calls } = setup();
  const { view } = watch(session, "customer");
  view.search("an");
  assert.deepEqual(calls[0].key, ["trama", "acme", "customers", { region: "" }, "an", 1]);
  await calls[0].resolve();
  view.more();
  await calls[1].resolve();
  const labels = ["Ana", "Andrew", "Antonia"];
  assert.deepEqual(shown(view), {
    status: "ready",
    text: "an",
    labels,
    complete: true,
    error: undefined,
  });
  session.edit("region", "South");
  assert.deepEqual(shown(view), { ...suspended("an"), status: "loading" });
  assert.deepEqual(calls[2].key, ["trama", "acme", "customers", { region: "South" }, "an", 1]);
  // A view that was never opened goes back to idle, without a request.
  const closed = watch(session, "customer").view;
  session.edit("region", "North");
  assert.equal(shown(closed).status, "idle");
  assert.equal(calls.length, 4);
});

test("Equal params data does not reload, so an edit that changes a read without changing the result preserves the view", async () => {
  const { session, calls } = setup(
    {
      contact: {
        params: ({ customer, note }) =>
          customer === null ? undefined : { customer: customer.value, long: note.length > 3 },
      },
    },
    { customer: ana },
  );
  const watched = watch(session, "contact");
  const { view } = watched;
  view.open();
  await calls[0].resolve();
  const before = view.getSnapshot();
  const notifications = watched.notifications;
  session.edit("note", "ab");
  session.edit("customer", { ...ana, label: "Ana Marie" });
  assert.equal(calls.length, 1);
  assert.equal(view.getSnapshot(), before);
  assert.equal(watched.notifications, notifications);
  session.edit("note", "abcd");
  assert.deepEqual(calls[1].key, ["trama", "acme", "contacts", { customer: 1, long: true }]);
});

test("A view without subscribers makes no requests and accepts no responses. Subscribing again syncs it with the current params", async () => {
  const { session, calls } = setup({}, { customer: ana });
  const view = session.list("contact");
  view.open();
  assert.equal(shown(view).status, "loading");
  assert.equal(calls.length, 0);
  const stop = view.subscribe(() => {});
  assert.deepEqual(calls[0].key, ["trama", "acme", "contacts", { customer: 1 }]);
  stop();
  assert.equal(calls[0].signal.aborted, true);
  await calls[0].resolve();
  assert.equal(shown(view).status, "loading");
  session.edit("customer", beto);
  assert.equal(calls.length, 1);
  view.subscribe(() => {});
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].key, ["trama", "acme", "contacts", { customer: 2 }]);
  await calls[1].resolve();
  const labels = ["Bernardo", "Diana"];
  assert.deepEqual(shown(view), {
    status: "ready",
    text: "",
    labels,
    complete: true,
    error: undefined,
  });
  // A paged view keeps the same rule.
  const paged = session.list("customer");
  paged.search("an");
  assert.equal(calls.length, 2);
  paged.subscribe(() => {});
  assert.deepEqual(calls[2].key, ["trama", "acme", "customers", { region: "" }, "an", 1]);
});

test("A list subscriber that throws or edits does not interrupt publication. The error is reported, the other views discard their attempt, and editing during notification throws", async () => {
  const { session, calls } = setup({});
  const reports = [];
  const report = globalThis.reportError;
  globalThis.reportError = (error) => reports.push(error.message);
  try {
    const failing = watch(session, "customer").view;
    const other = watch(session, "customer").view;
    let armed = false;
    failing.subscribe(() => {
      if (armed) throw new Error("View failed");
    });
    other.subscribe(() => {
      if (armed) session.edit("note", "nested");
    });
    let published = 0;
    session.subscribe(() => published++);
    failing.open();
    other.open();
    await calls[0].resolve();
    await calls[1].resolve();
    armed = true;
    session.edit("region", "south");
    assert.equal(published, 1);
    assert.equal(session.getSnapshot().values.note, "");
    assert.deepEqual(reports.toSorted(), [
      "Cannot edit a session during its notification",
      "View failed",
    ]);
    // Both views started again with the new params, and each one takes only its answer.
    assert.deepEqual(
      calls.map((call) => call.key[3]),
      [{ region: "" }, { region: "" }, { region: "south" }, { region: "south" }],
    );
    await calls[3].resolve();
    assert.equal(shown(other).status, "ready");
    assert.equal(shown(failing).status, "loading");
  } finally {
    globalThis.reportError = report;
  }
});
