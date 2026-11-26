import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { act, createElement as h, deferred, flush, mount } from "./helpers/react.mjs";
import { createQueryClient } from "./helpers/query.mjs";

const order = defineForm({
  fields: {
    customer: field.text(),
    includeNote: field.checkbox({ default: true }),
    confirmed: field.checkbox(),
    note: field.text({ default: "Leave with the concierge" }),
  },
  rules: {
    note: { disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed] },
  },
});

// Text renderers record their commits; checkbox renderers are not measured.
function measuredBinding(commits) {
  function TextInput({ name, value, disabled, onChange }) {
    useLayoutEffect(() => {
      commits.push(name);
    });
    return h("input", { name, value, disabled, onInput: (event) => onChange(event.target.value) });
  }
  return createReactBinding({
    text: TextInput,
    checkbox: ({ name, value, disabled, onChange }) =>
      h("input", {
        name,
        type: "checkbox",
        checked: value,
        disabled,
        onChange: (event) => onChange(event.currentTarget.checked),
      }),
  });
}

test("renderers receive disabled through property-based authoring, and a state-only change updates them", async () => {
  const commits = [];
  const { Field } = measuredBinding(commits);
  const session = createSession(order, { initial: { note: "Saved" } });
  const view = await mount(() =>
    h(
      "div",
      null,
      ["customer", "includeNote", "confirmed", "note"].map((name) =>
        h(Field, { key: name, session, name }),
      ),
    ),
  );
  const note = () => view.container.querySelector('[name="note"]');
  const click = (name) => act(() => view.container.querySelector(`[name="${name}"]`).click());
  try {
    assert.equal(note().disabled, false);
    commits.length = 0;
    await click("includeNote");
    assert.equal(note().disabled, true);
    assert.equal(note().value, "Saved");
    assert.deepEqual(commits, ["note"], "Only the state of note changed");
    await click("confirmed");
    await click("includeNote");
    assert.equal(note().disabled, true, "confirmed still disables it");
    await act(() => session.edit("note", "Imported"));
    assert.equal(note().value, "Imported");
    await click("confirmed");
    assert.equal(note().disabled, false);
    await click("includeNote");
    await act(() => session.reset());
    assert.equal(note().disabled, false);
    assert.equal(note().value, "Saved");
  } finally {
    await view.unmount();
  }
});

test("TanStack Query opens prepared state, and a disabled-only change updates both views without unrelated renders", async () => {
  const { view, client, request, commits, getEditor } = await mountNotes();
  const notes = () =>
    [...view.container.querySelectorAll('[name="note"]')].map(({ value, disabled }) => ({
      value,
      disabled,
    }));
  const click = (name) => act(() => view.container.querySelector(`[name="${name}"]`).click());
  try {
    assert.equal(getEditor().status, "loading");
    assert.equal("session" in getEditor(), false);
    await act(() => request.resolve({ includeNote: false, locked: true, note: "Saved" }));
    await flush();
    assert.deepEqual(notes(), [
      { value: "Saved", disabled: true },
      { value: "Saved", disabled: true },
      { value: "Independent", disabled: false },
    ]);
    commits.length = 0;
    await click("includeNote");
    assert.deepEqual(commits, []);
    await click("locked");
    assert.deepEqual(notes(), [
      { value: "Saved", disabled: false },
      { value: "Saved", disabled: false },
      { value: "Independent", disabled: false },
    ]);
    assert.deepEqual(commits, ["primary", "mirror"]);
    await click("includeNote");
    await act(() => getEditor().session.edit("note", "Imported"));
    assert.deepEqual(notes().slice(0, 2), [
      { value: "Imported", disabled: true },
      { value: "Imported", disabled: true },
    ]);
    await click("includeNote");
    assert.equal(notes()[0].value, "Imported");
    await act(() => client.setQueryData(["note"], { includeNote: true, note: "Refetch" }));
    await act(() => getEditor().session.reset());
    assert.deepEqual(notes(), [
      { value: "Saved", disabled: true },
      { value: "Saved", disabled: true },
      { value: "Independent", disabled: false },
    ]);
  } finally {
    await view.unmount();
    client.clear();
  }
});

test("a state failure prevents readiness, TanStack Query retains error and retry, and synchronous opening throws", async () => {
  const { useFormSession } = createReactBinding({ text: () => null });
  await assert.rejects(
    mount(() => {
      useFormSession(invalidState, { initial: { note: "invalid" } });
      return null;
    }),
    (error) => error.cause === stateFailure && /note.*disabled/u.test(error.message),
  );
  const client = createQueryClient();
  client.setQueryData(["failed-state"], { note: "invalid" });
  const request = deferred();
  let editor;
  function Editor() {
    const query = useQuery({
      queryKey: ["failed-state"],
      staleTime: Infinity,
      queryFn: () => request.promise,
    });
    const current = useFormSession(invalidState, { initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = current;
    });
    return h("output", null, current.status);
  }
  const view = await mount(() => h(QueryClientProvider, { client }, h(Editor)));
  try {
    assert.equal(editor.status, "error");
    assert.equal(editor.error.cause, stateFailure);
    assert.equal("session" in editor, false);
    await act(() => editor.retry());
    assert.equal(editor.status, "loading");
    await act(() => request.resolve({ note: "Recovered" }));
    await flush();
    assert.equal(editor.status, "ready");
    assert.equal(editor.session.getSnapshot().fieldStates.note.disabled, true);
    editor.session.edit("note", "Edited");
    editor.session.reset();
    assert.equal(editor.session.getSnapshot().values.note, "Recovered");
  } finally {
    await view.unmount();
    client.clear();
  }
});

const noteDefinition = defineForm({
  fields: {
    includeNote: field.checkbox(),
    locked: field.checkbox(),
    note: field.text(),
    title: field.text(),
  },
  rules: {
    note: { disabled: [({ locked }) => locked, ({ includeNote }) => !includeNote] },
  },
});

function labelledBinding(commits) {
  function TextInput({ label, name, value, disabled, onChange }) {
    useLayoutEffect(() => {
      commits.push(label);
    });
    return h("input", {
      name,
      value,
      disabled,
      onInput: (event) => onChange(event.currentTarget.value),
    });
  }
  return createReactBinding({
    text: TextInput,
    checkbox: ({ name, value, disabled, onChange }) =>
      h("input", {
        name,
        type: "checkbox",
        checked: value,
        disabled,
        onChange: (event) => onChange(event.currentTarget.checked),
      }),
  });
}

async function mountNotes() {
  const commits = [];
  const { Field, useFormSession } = labelledBinding(commits);
  const client = createQueryClient();
  const request = deferred();
  const other = createSession(noteDefinition, {
    initial: { includeNote: true, note: "Independent" },
  });
  let editor;
  function Editor() {
    const query = useQuery({
      queryKey: ["note"],
      queryFn: () => request.promise,
      staleTime: Infinity,
    });
    const current = useFormSession(noteDefinition, { initial: initialFromQuery(query) });
    useLayoutEffect(() => {
      editor = current;
    });
    if (current.status !== "ready") return h("output", null, current.status);
    return h(
      "div",
      null,
      h(Field, { session: current.session, name: "includeNote" }),
      h(Field, { session: current.session, name: "locked" }),
      h(Field, { session: current.session, name: "note", label: "primary" }),
      h(Field, { session: current.session, name: "note", label: "mirror" }),
      h(Field, { session: current.session, name: "title", label: "unrelated" }),
      h(Field, { session: other, name: "note", label: "independent" }),
    );
  }
  const view = await mount(() => h(QueryClientProvider, { client }, h(Editor)));
  return { view, client, request, commits, getEditor: () => editor };
}

const stateFailure = new Error("State unavailable");
const invalidState = defineForm({
  fields: { note: field.text() },
  rules: {
    note: {
      disabled: ({ note }) => {
        if (note === "invalid") throw stateFailure;
        return true;
      },
    },
  },
});
