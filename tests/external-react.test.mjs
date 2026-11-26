import assert from "node:assert/strict";
import { test } from "node:test";
import { Profiler } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, bindingOf, createElement as h, last, mount, recorder } from "./helpers/react.mjs";

// The external errors in the binding: a renderer receives them among its
// errors always, whatever the policy shows of the local ones, after them and
// each text once; and useFormState gives those of its scope the same way.
const order = defineForm({
  fields: {
    customer: field.text({ required: true }),
    note: field.text(),
    discount: field.number(),
  },
  collections: {
    lines: {
      fields: { amount: field.number({ required: true }), memo: field.text({ required: true }) },
    },
  },
  rules: {
    lines: { row: { error: ({ amount }) => (amount ?? 0) < 0 && "Negative amount" } },
  },
  form: { error: ({ note }) => note === "x" && "Disallowed note" },
});

// Each Field of the header under a Profiler, which counts the Field itself.
const header = (Field, session, fields) =>
  h(
    "div",
    null,
    ["customer", "note", "discount"].map((name) =>
      h(
        Profiler,
        { key: name, id: name, onRender: (id) => fields.push(id) },
        h(Field, { session, name }),
      ),
    ),
  );

test("An external error is always shown after visible local errors and only its field rerenders", async () => {
  const renders = [];
  const fields = [];
  const { Field } = bindingOf(renders);
  const session = createSession(order);
  const view = await mount(() => header(Field, session, fields));
  try {
    const mounted = fields.length;
    await act(() => {
      session.setErrors("server", [{ field: "customer", message: "Customer blocked" }]);
    });
    assert.deepEqual(fields.slice(mounted), ["customer"]);
    // The local one stays hidden until the field is touched.
    assert.deepEqual(last(renders, "customer").errors, ["Customer blocked"]);
    await act(() => {
      last(renders, "customer").onBlur();
    });
    assert.deepEqual(last(renders, "customer").errors, ["Required", "Customer blocked"]);
    // A publication that does not change the field keeps its props.
    const before = fields.length;
    const errors = last(renders, "customer").errors;
    await act(() => {
      session.edit("note", "a");
      session.setWarnings("server", [{ message: "General" }]);
    });
    assert.deepEqual(fields.slice(before), ["note"]);
    assert.equal(last(renders, "customer").errors, errors);
    // An attempt reveals nothing new of a field already touched: no render.
    const attempts = fields.length;
    await act(() => session.prepare());
    assert.deepEqual(fields.slice(attempts), []);
    assert.equal(last(renders, "customer").errors, errors);
    // Editing the field withdraws its external, in the render of the edit.
    const edits = fields.length;
    await act(() => {
      session.edit("customer", "Ana");
    });
    assert.deepEqual(fields.slice(edits), ["customer"]);
    assert.deepEqual(last(renders, "customer").errors, []);
  } finally {
    await view.unmount();
  }
});

test("A message that is both local and external appears once, and external warnings appear with the other warnings", async () => {
  const renders = [];
  const { Field } = bindingOf(renders, { showErrors: "attempted" });
  const session = createSession(order);
  const view = await mount(() => header(Field, session, []));
  try {
    await act(() => {
      session.setErrors("server", [
        { field: "customer", message: "Required" },
        { field: "customer", message: "Customer blocked" },
      ]);
      session.setWarnings("server", [{ field: "customer", message: "New customer" }]);
      session.touch("customer");
    });
    // With "attempted", touching shows no local error: only the external ones.
    assert.deepEqual(last(renders, "customer").errors, ["Required", "Customer blocked"]);
    assert.deepEqual(last(renders, "customer").warnings, ["New customer"]);
    await act(() => session.prepare());
    assert.deepEqual(last(renders, "customer").errors, ["Required", "Customer blocked"]);
    await act(() => {
      session.setErrors("server", []);
    });
    assert.deepEqual(last(renders, "customer").errors, ["Required"]);
  } finally {
    await view.unmount();
  }
});

test("An external error for a cell reaches its renderer without rendering cells in other rows", async () => {
  const renders = [];
  const cells = [];
  const { Field } = bindingOf(renders);
  const session = createSession(order, { initial: { lines: [{ amount: 1 }, { amount: 2 }] } });
  const keys = session.getSnapshot().rows.lines;
  const view = await mount(() =>
    h(
      "div",
      null,
      keys.map((key) =>
        h(
          Profiler,
          { key, id: key, onRender: (id) => cells.push(id) },
          h(Field, { row: session.row("lines", key), name: "amount" }),
        ),
      ),
    ),
  );
  try {
    const mounted = cells.length;
    await act(() => {
      session.setErrors("server", [
        { collection: "lines", key: keys[1], field: "amount", message: "Amount rejected" },
      ]);
    });
    assert.deepEqual(cells.slice(mounted), [keys[1]]);
    assert.deepEqual(renders.at(-1).errors, ["Amount rejected"]);
  } finally {
    await view.unmount();
  }
});

test("useFormState always includes external errors for its scope among its errors, without externalErrors", async () => {
  const { useFormState } = createReactBinding({});
  const session = createSession(order, { initial: { note: "x", lines: [{ amount: -1 }, {}] } });
  const [first, second] = session.getSnapshot().rows.lines;
  const states = { form: [], lines: [], first: [], second: [] };
  const view = await mount(() =>
    h(
      "div",
      null,
      h(recorder(useFormState, states.form, () => [session])),
      h(recorder(useFormState, states.lines, () => [session, "lines"])),
      h(recorder(useFormState, states.first, () => [session.row("lines", first)])),
      h(recorder(useFormState, states.second, () => [session.row("lines", second)])),
    ),
  );
  try {
    const others = states.second.length;
    await act(() => {
      session.setErrors("server", [
        { message: "Order rejected" },
        { collection: "lines", message: "Lines rejected" },
        { collection: "lines", key: first, message: "Line rejected" },
      ]);
    });
    // The local ones of each scope stay hidden: nothing was attempted or touched.
    assert.deepEqual(states.form.at(-1).errors, ["Order rejected"]);
    assert.deepEqual(states.lines.at(-1).errors, ["Lines rejected"]);
    assert.deepEqual(states.first.at(-1).errors, ["Line rejected"]);
    for (const scope of ["form", "lines", "first"])
      assert.equal("externalErrors" in states[scope].at(-1), false, scope);
    assert.equal(states.second.length, others, "The other row does not rerender");
    await act(() => session.prepare());
    assert.deepEqual(states.form.at(-1).errors, ["Disallowed note", "Order rejected"]);
    assert.deepEqual(states.first.at(-1).errors, ["Negative amount", "Line rejected"]);
    // An external in a cell that already had an error changes the snapshot of
    // its row, not what the row counts nor its messages: its state is kept.
    const before = states.first.length;
    const snapshot = session.row("lines", first).getSnapshot();
    await act(() => {
      session.setErrors("audit", [
        { collection: "lines", key: first, field: "memo", message: "Memo rejected" },
      ]);
    });
    assert.notEqual(session.row("lines", first).getSnapshot(), snapshot);
    assert.equal(states.first.length, before);
  } finally {
    await view.unmount();
  }
});

test("Withdrawing an external error that duplicates a visible local error does not change the state from useFormState", async () => {
  const { useFormState } = createReactBinding({});
  const session = createSession(order, { initial: { note: "x", lines: [{ amount: 1 }] } });
  const states = [];
  const view = await mount(recorder(useFormState, states, () => [session]));
  try {
    await act(() => session.prepare());
    await act(() => {
      session.setErrors("server", [{ message: "Disallowed note" }]);
    });
    assert.deepEqual(states.at(-1).errors, ["Disallowed note"]);
    const before = states.length;
    const held = states.at(-1);
    // The form counts itself once, with the local error or the external one.
    await act(() => {
      session.setErrors("server", []);
    });
    assert.equal(states.length, before);
    assert.equal(session.getSnapshot().form.errorCount, held.errorCount);
  } finally {
    await view.unmount();
  }
});
