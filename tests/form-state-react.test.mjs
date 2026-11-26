import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount, recorder } from "./helpers/react.mjs";

// ui.useFormState gives the state of one scope: the form, a collection or a
// row. Its own errors are those the policy of the binding shows; its warnings,
// counts and dirty are whole; and it has its marks. It keeps its object while
// that content does not change, so the hook of a row does not render for
// another.
const ledger = defineForm({
  fields: { title: field.text({ required: true }), note: field.text() },
  collections: { lines: { fields: { amount: field.number(), memo: field.text() } } },
  rules: {
    lines: {
      row: { error: ({ amount }) => (amount ?? 0) < 0 && "Negative amount" },
      collection: { warning: ({ lines }) => lines.length === 0 && "No lines" },
    },
  },
  form: { error: ({ note }) => note === "x" && "Note not allowed" },
});
const initial = { note: "x", lines: [{ amount: -1 }, { amount: 2 }] };

test("form state shows its own errors after an attempt and includes complete counts and markers", async () => {
  const { useFormState } = createReactBinding({});
  const session = createSession(ledger, { initial });
  const states = [];
  const view = await mount(recorder(useFormState, states, () => [session]));
  try {
    assert.deepEqual(states.at(-1), {
      errors: [],
      warnings: [],
      errorCount: 3,
      warningCount: 0,
      dirty: false,
      inputPending: false,
      attempted: false,
    });
    await act(() => session.prepare());
    assert.deepEqual(states.at(-1).errors, ["Note not allowed"]);
    assert.equal(states.at(-1).attempted, true);
    await act(() => {
      session.input("title").error("Pending text");
    });
    assert.equal(states.at(-1).inputPending, true);
    // An operation that changes nothing of the form keeps its object.
    const before = states.length;
    await act(() => {
      session.touch("note");
    });
    assert.equal(states.length, before);
  } finally {
    await view.unmount();
  }
});

test("collection state always shows its own warning and shows its own errors after an attempt", async () => {
  const { useFormState } = createReactBinding({});
  const session = createSession(ledger, { initial: { lines: [] } });
  const states = [];
  const view = await mount(recorder(useFormState, states, () => [session, "lines"]));
  try {
    assert.deepEqual(states.at(-1), {
      errors: [],
      warnings: ["No lines"],
      errorCount: 0,
      warningCount: 1,
      dirty: false,
    });
  } finally {
    await view.unmount();
  }
  assert.throws(() => useFormState(session, "absent"), { message: 'Unknown collection "absent"' });
});

test("row state shows its errors when touched or after an attempt, and does not rerender for another row", async () => {
  const { useFormState } = createReactBinding({});
  const session = createSession(ledger, { initial });
  const [first, second] = session.getSnapshot().rows.lines;
  const firstRow = session.row("lines", first);
  const secondRow = session.row("lines", second);
  const states = [];
  const others = [];
  const view = await mount(() =>
    h(
      "div",
      null,
      h(recorder(useFormState, states, () => [firstRow])),
      h(recorder(useFormState, others, () => [secondRow])),
    ),
  );
  try {
    assert.deepEqual(states.at(-1), {
      errors: [],
      warnings: [],
      errorCount: 1,
      warningCount: 0,
      dirty: false,
      touched: false,
      attempted: false,
    });
    const renders = others.length;
    await act(() => {
      session.row("lines", first).touch();
    });
    assert.deepEqual(states.at(-1).errors, ["Negative amount"]);
    assert.equal(states.at(-1).touched, true);
    await act(() => {
      session.row("lines", first).edit("amount", -5);
    });
    assert.equal(others.length, renders);
    // A removed row gives undefined.
    await act(() => {
      session.remove("lines", [first]);
    });
    assert.equal(states.at(-1), undefined);
  } finally {
    await view.unmount();
  }
});

test("an edit that leaves the row state unchanged retains its object", async () => {
  const { useFormState } = createReactBinding({});
  const session = createSession(ledger, { initial });
  const row = session.row("lines", session.getSnapshot().rows.lines[0]);
  const states = [];
  const view = await mount(recorder(useFormState, states, () => [row]));
  try {
    await act(() => {
      row.edit("amount", -5);
    });
    assert.equal(states.at(-1).dirty, true);
    // The snapshot of the row changes, and its state does not.
    const edited = states.length;
    await act(() => {
      row.edit("amount", -6);
    });
    assert.equal(states.length, edited);
  } finally {
    await view.unmount();
  }
});

test("with showErrors set to attempted, a touched row does not show its errors until an attempt", async () => {
  const { useFormState } = createReactBinding({}, { showErrors: "attempted" });
  const session = createSession(ledger, { initial });
  const [first] = session.getSnapshot().rows.lines;
  const states = [];
  const view = await mount(recorder(useFormState, states, () => [session.row("lines", first)]));
  try {
    await act(() => {
      session.row("lines", first).touch("amount");
    });
    assert.deepEqual([states.at(-1).errors, states.at(-1).touched], [[], true]);
    await act(() => session.prepare());
    assert.deepEqual(states.at(-1).errors, ["Negative amount"]);
  } finally {
    await view.unmount();
  }
});
