import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

test("text, number, checkbox, and select fields have empty and default values, and initial takes precedence without treating falsy values as absent", () => {
  const definition = defineForm({
    fields: {
      title: field.text({ default: "Default" }),
      estimate: field.number({ default: 8 }),
      done: field.checkbox({ default: true }),
      status: field.select({
        options: [
          { value: "draft", label: "Draft" },
          { value: "ready", label: "Ready" },
        ],
        default: "ready",
      }),
      emptyText: field.text(),
      emptyNumber: field.number(),
      emptyCheck: field.checkbox(),
      emptySelect: field.select({ options: [{ value: 0, label: "Zero" }] }),
    },
  });
  const session = createSession(definition, {
    initial: { title: "", estimate: 0, done: false, status: null },
  });
  assert.deepEqual(session.getSnapshot().values, {
    title: "",
    estimate: 0,
    done: false,
    status: null,
    emptyText: "",
    emptyNumber: null,
    emptyCheck: false,
    emptySelect: null,
  });
  assert.equal(createSession(definition).getSnapshot().values.status, "ready");
  session.edit("estimate", null);
  session.edit("emptySelect", 0);
  assert.equal(session.getSnapshot().values.estimate, null);
  assert.equal(session.getSnapshot().values.emptySelect, 0);
});

test("incompatible configuration and values are rejected with the field and type, without coercion or partial edits", () => {
  assert.throws(
    () => defineForm({ fields: { amount: field.number({ default: Infinity }) } }),
    /amount.*number/u,
  );
  assert.throws(
    () => defineForm({ fields: { title: field.text({ default: null }) } }),
    /title.*text/u,
  );
  assert.throws(
    () => defineForm({ fields: { done: field.checkbox({ default: 0 }) } }),
    /done.*checkbox/u,
  );
  assert.throws(
    () =>
      defineForm({
        fields: {
          status: field.select({
            options: [
              { value: "a", label: "A" },
              { value: "a", label: "Again" },
            ],
          }),
        },
      }),
    /status.*duplicate/u,
  );
  assert.throws(
    () =>
      defineForm({
        fields: { status: field.select({ options: [{ value: "a", label: "A" }], default: "b" }) },
      }),
    /status.*select/u,
  );
  assert.throws(
    () =>
      defineForm({ fields: { status: field.select({ options: [{ value: NaN, label: "Bad" }] }) } }),
    /status/u,
  );
  assert.throws(() => defineForm({ fields: { title: { type: "unknown" } } }), /title.*unknown/u);
});

test("incompatible initial values and edits are rejected without changing the snapshot", () => {
  const definition = defineForm({
    fields: {
      title: field.text(),
      amount: field.number(),
      done: field.checkbox(),
      status: field.select({
        options: [
          { value: 1, label: "One" },
          { value: "1", label: "String one" },
        ],
      }),
    },
  });
  for (const initial of [
    { missing: true },
    { amount: "2" },
    { title: undefined },
    { done: null },
    null,
    [],
  ]) {
    assert.throws(() => createSession(definition, { initial }));
  }
  const session = createSession(definition, { initial: { title: "Safe" } });
  const snapshot = session.getSnapshot();
  for (const [name, value] of [
    ["amount", NaN],
    ["amount", -Infinity],
    ["title", null],
    ["done", "true"],
    ["status", 2],
    ["missing", 0],
  ]) {
    assert.throws(() => session.edit(name, value), new RegExp(name, "u"));
    assert.equal(session.getSnapshot(), snapshot);
  }
  session.edit("status", "1");
  assert.equal(session.getSnapshot().values.status, "1");
});

test("independent sessions publish immutable snapshots, support unsubscribing, and make reset observable", () => {
  const config = { title: field.text({ default: "Draft" }), estimate: field.number() };
  const definition = defineForm({ fields: config });
  const initial = { title: "Baseline" };
  const a = createSession(definition, { initial });
  const b = createSession(definition);
  const original = a.getSnapshot();
  assert.equal(original, a.getSnapshot());
  const notifications = [];
  const unsubscribe = a.subscribe(() => notifications.push(a.getSnapshot()));
  a.edit("title", "Edited");
  assert.equal(notifications.length, 1);
  assert.equal(original.values.title, "Baseline");
  assert.equal(b.getSnapshot().values.title, "Draft");
  assert.throws(() => {
    original.values.title = "Tamper";
  }, TypeError);
  initial.title = "Changed initial";
  config.title = field.text({ default: "Changed definition" });
  assert.equal(definition.fields.title.default, "Draft");
  assert.throws(() => {
    definition.fields.title.default = "Tamper";
  }, TypeError);
  a.reset();
  assert.equal(a.getSnapshot().values.title, "Baseline");
  assert.equal(a.getSnapshot().resetVersion, 1);
  a.reset();
  assert.equal(a.getSnapshot().resetVersion, 2, "A reset with no changes is also observable");
  assert.equal(notifications.length, 3);
  unsubscribe();
  unsubscribe();
  a.edit("title", "After unsubscribe");
  assert.equal(notifications.length, 3);
  assert.equal(a.getSnapshot().resetVersion, 2);
});

test("createSession rejects definitions not created by defineForm, including copies, before validating initial", () => {
  const definition = defineForm({
    fields: { quantity: field.number({ default: 2 }), total: field.number() },
    rules: { total: { value: ({ quantity }) => (quantity ?? 0) * 10 } },
  });
  for (const foreign of [
    { ...definition },
    Object.assign({}, definition),
    Object.freeze({ fields: definition.fields }),
    { fields: { title: { type: "text", default: 5 } } },
    null,
  ])
    assert.throws(
      () => createSession(foreign, { initial: { missing: 1 } }),
      /^Error: Form definition must be created with defineForm$/u,
    );
  assert.equal(createSession(definition).getSnapshot().values.total, 20);
});

test("subscribe isolates exceptions and reentrant edit and reset calls after publishing", (t) => {
  const errors = [];
  const oldReport = Object.getOwnPropertyDescriptor(globalThis, "reportError");
  Object.defineProperty(globalThis, "reportError", {
    configurable: true,
    value: (error) => errors.push(error),
  });
  t.after(() => {
    if (oldReport) Object.defineProperty(globalThis, "reportError", oldReport);
    else delete globalThis.reportError;
  });
  const session = createSession(defineForm({ fields: { total: field.number() } }));
  const other = createSession(session.definition);
  const failure = new Error("Observer failed");
  const observed = [];
  session.subscribe(() => {
    throw failure;
  });
  session.subscribe(() => session.edit("total", 99));
  session.subscribe(() => session.reset());
  session.subscribe(() => {
    observed.push(session.getSnapshot().values.total);
    other.edit("total", 7);
  });
  assert.doesNotThrow(() => session.edit("total", 25));
  assert.deepEqual(observed, [25]);
  assert.equal(session.getSnapshot().values.total, 25);
  assert.equal(other.getSnapshot().values.total, 7);
  assert.equal(errors[0], failure);
  assert.match(errors[1].message, /edit.*notif/u);
  assert.match(errors[2].message, /reset.*notif/u);
});
