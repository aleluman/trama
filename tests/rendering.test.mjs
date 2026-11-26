import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

test("editing one field does not rerender unrelated fields or the editor", async () => {
  const commits = { editor: 0, title: 0, notes: 0 };
  function TextInput({ name, value, onChange }) {
    useLayoutEffect(() => {
      commits[name] += 1;
    });
    return h("button", { onClick: () => onChange("Edited") }, `${name}: ${value}`);
  }
  const { Field, useFormSession } = createReactBinding({ text: TextInput });
  const definition = defineForm({ fields: { title: field.text(), notes: field.text() } });
  function Editor() {
    const editor = useFormSession(definition);
    useLayoutEffect(() => {
      commits.editor += 1;
    });
    if (editor.status !== "ready") return null;
    return h(
      "div",
      null,
      h(Field, { session: editor.session, name: "title" }),
      h(Field, { session: editor.session, name: "notes" }),
    );
  }
  const view = await mount(Editor);
  try {
    Object.assign(commits, { editor: 0, title: 0, notes: 0 });
    await act(() => {
      view.container.querySelector("button").click();
    });
    assert.equal(view.container.querySelector("button").textContent, "title: Edited");
    assert.deepEqual(commits, { editor: 0, title: 1, notes: 0 });
  } finally {
    await view.unmount();
  }
});

test("two views update only the edited field and summary, and reset still affects the whole session", async () => {
  const commits = new Map();
  const { Field, Summary } = measuredBinding(commits);
  const session = createSession(fourFields);
  const other = createSession(defineForm({ fields: { independent: field.text() } }));
  const view = await mount(() =>
    h(
      "div",
      null,
      ["primary", "mirror"].map((label) =>
        h(
          "section",
          { key: label },
          ["title", "estimate", "done", "status"].map((name) =>
            h(Field, { key: name, session, name }),
          ),
        ),
      ),
      h(Summary, { session }),
      h(Field, { session: other, name: "independent" }),
    ),
  );
  try {
    commits.clear();
    await act(() => {
      session.edit("title", "Edited");
    });
    assert.deepEqual(Object.fromEntries(commits), { title: 2, summary: 1 });
    commits.clear();
    await act(() => {
      session.edit("title", "Edited");
    });
    assert.deepEqual(Object.fromEntries(commits), { summary: 1 });
    commits.clear();
    await act(() => {
      session.reset();
    });
    assert.deepEqual(Object.fromEntries(commits), {
      title: 2,
      estimate: 2,
      done: 2,
      status: 2,
      summary: 1,
    });
  } finally {
    await view.unmount();
  }
});

function measuredBinding(commits) {
  const record = (name) => commits.set(name, (commits.get(name) ?? 0) + 1);
  function Input({ name, value }) {
    useLayoutEffect(() => {
      record(name);
    });
    return h("span", null, String(value));
  }
  function Summary({ session }) {
    const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
    useLayoutEffect(() => {
      record("summary");
    });
    return h("pre", null, JSON.stringify(snapshot.values));
  }
  const { Field } = createReactBinding({
    text: Input,
    number: Input,
    checkbox: Input,
    select: Input,
  });
  return { Field, Summary };
}

const fourFields = defineForm({
  fields: {
    title: field.text(),
    estimate: field.number(),
    done: field.checkbox(),
    status: field.select({ options: [{ value: "draft", label: "Draft" }] }),
  },
});

test("updating local editor state does not rerender Fields whose props are unchanged", async () => {
  const commits = { editor: 0, title: 0, notes: 0 };
  function Input({ name, value }) {
    useLayoutEffect(() => {
      commits[name] += 1;
    });
    return h("span", null, value);
  }
  const { Field, useFormSession } = createReactBinding({ text: Input });
  const definition = defineForm({ fields: { title: field.text(), notes: field.text() } });
  function Editor() {
    const [screenNote, setScreenNote] = useState("");
    const editor = useFormSession(definition);
    useLayoutEffect(() => {
      commits.editor += 1;
    });
    if (editor.status !== "ready") return null;
    return h(
      "div",
      null,
      h("input", {
        value: screenNote,
        onInput: (event) => setScreenNote(event.currentTarget.value),
      }),
      h(Field, { session: editor.session, name: "title" }),
      h(Field, { session: editor.session, name: "notes" }),
    );
  }
  const view = await mount(Editor);
  try {
    Object.assign(commits, { editor: 0, title: 0, notes: 0 });
    await act(() => {
      const input = view.container.querySelector("input");
      input.value = "Local note";
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(view.container.querySelector("input").value, "Local note");
    assert.deepEqual(commits, { editor: 1, title: 0, notes: 0 });
  } finally {
    await view.unmount();
  }
});

test("Field still applies presentation and name changes after memoization", async () => {
  const { Field } = createReactBinding({ text: PresentationInput });
  const session = createSession(
    defineForm({ fields: { title: field.text(), notes: field.text() } }),
  );
  const view = await mount((props) => h(Field, { session, ...props }), {
    name: "title",
    label: "Original",
    placeholder: "First",
  });
  try {
    await view.render({ name: "title", label: "Local override", placeholder: "Changed" });
    assert.equal(view.container.querySelector("button").textContent, "Local override: title=");
    assert.equal(view.container.querySelector("button").title, "Changed");
    await view.render({ name: "notes", label: "Notes", placeholder: "Other field" });
    await act(() => {
      view.container.querySelector("button").click();
    });
    assert.deepEqual(session.getSnapshot().values, { title: "", notes: "Edited" });
  } finally {
    await view.unmount();
  }
});

function PresentationInput({ name, label, placeholder, value, onChange }) {
  return h(
    "button",
    { title: placeholder, onClick: () => onChange("Edited") },
    `${label}: ${name}=${value}`,
  );
}
