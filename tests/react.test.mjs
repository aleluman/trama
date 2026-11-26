import assert from "node:assert/strict";
import { test } from "node:test";
import { useState } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

const text = (props) =>
  h(
    "label",
    { htmlFor: props.id },
    props.label,
    h("input", {
      id: props.id,
      name: props.name,
      value: props.value,
      placeholder: props.placeholder,
      onChange: (event) => props.onChange(event.target.value),
    }),
  );
const binding = createReactBinding({ text });
const definition = defineForm({
  fields: { title: field.text({ label: "Title", placeholder: "Task name" }) },
});

test("Field observes one session in two views with their own presentation and IDs", async () => {
  const session = createSession(definition, { initial: { title: "Initial" } });
  const other = createSession(definition);
  const view = await mount(() =>
    h(
      "div",
      null,
      h(binding.Field, { session, name: "title" }),
      h(binding.Field, { session, name: "title", label: "Preview", placeholder: "Only here" }),
      h(binding.Field, { session: other, name: "title" }),
    ),
  );
  try {
    const inputs = [...view.container.querySelectorAll("input")];
    assert.equal(inputs.length, 3);
    assert.equal(new Set(inputs.map((input) => input.id)).size, 3);
    assert.deepEqual(
      inputs.map((input) => input.placeholder),
      ["Task name", "Only here", "Task name"],
    );
    assert.deepEqual(
      [...view.container.querySelectorAll("label")].map((label) => label.textContent),
      ["Title", "Preview", "Title"],
    );
    await act(() => {
      session.edit("title", "Together");
    });
    assert.deepEqual(
      inputs.map((input) => input.value),
      ["Together", "Together", ""],
    );
    await act(() => {
      session.reset();
    });
    assert.deepEqual(
      [...view.container.querySelectorAll("input")].map((input) => input.value),
      ["Initial", "Initial", ""],
    );
  } finally {
    await view.unmount();
  }
});

test("the registry is reused and requires coverage for every definition when opening it or connecting a view", async () => {
  assert.throws(() => createReactBinding({ text: "input" }), /text.*renderer/u);
  assert.throws(() => createReactBinding({ unknown: () => null }), /unknown/u);
  const uncovered = defineForm({ fields: { title: field.text(), hidden: field.number() } });
  await assert.rejects(
    mount(() => {
      binding.useFormSession(uncovered);
      return null;
    }),
    /hidden.*number/u,
  );
  await assert.rejects(
    mount(() => h(binding.Field, { session: createSession(uncovered), name: "title" })),
    /hidden.*number/u,
  );
  const second = defineForm({ fields: { name: field.text({ default: "Second" }) } });
  let editor;
  const view = await mount(() => {
    editor = binding.useFormSession(second);
    return null;
  });
  try {
    assert.equal(editor.session.getSnapshot().values.name, "Second");
  } finally {
    await view.unmount();
  }
});

test("an undefined renderer is skipped and does not cover its type, and an unknown key is still rejected", async () => {
  assert.throws(() => createReactBinding({ text, unknown: undefined }), {
    message: "unknown: invalid renderer",
  });
  const partial = createReactBinding({ text, number: undefined });
  const uncovered = defineForm({ fields: { title: field.text(), amount: field.number() } });
  await assert.rejects(
    mount(() => {
      partial.useFormSession(uncovered);
      return null;
    }),
    { message: 'Field "amount" (number): missing renderer' },
  );
  const view = await mount(() =>
    h(partial.Field, { session: createSession(definition), name: "title" }),
  );
  try {
    assert.equal(view.container.querySelector("input").placeholder, "Task name");
  } finally {
    await view.unmount();
  }
});

test("Field treats undefined label and placeholder as omitted", async () => {
  const session = createSession(definition);
  const view = await mount(() =>
    h(binding.Field, { session, name: "title", label: undefined, placeholder: undefined }),
  );
  try {
    assert.equal(view.container.querySelector("label").textContent, "Title");
    assert.equal(view.container.querySelector("input").placeholder, "Task name");
  } finally {
    await view.unmount();
  }
});

test("key replaces only the session, retains local state, and does not share sessions across identical hooks", async () => {
  let editors;
  function Editor({ identity, initial, form = definition }) {
    const a = binding.useFormSession(form, { key: identity, initial });
    const b = binding.useFormSession(form, { key: identity });
    editors = [a, b];
    return null;
  }
  const view = await mount(Editor, { identity: undefined, initial: { title: "New" } });
  try {
    const first = editors[0].session;
    first.edit("title", "Local");
    await view.render({ identity: undefined, initial: { title: "Ignored" } });
    assert.equal(editors[0].session, first);
    assert.equal(editors[0].session.getSnapshot().values.title, "Local");
    assert.equal(editors[1].session.getSnapshot().values.title, "");
    await view.render({ identity: "A", initial: { title: "Edit A" } });
    assert.notEqual(editors[0].session, first);
    assert.equal(editors[0].session.getSnapshot().values.title, "Edit A");
    await view.render({ identity: "B", initial: { title: "Edit B" } });
    assert.equal(editors[0].session.getSnapshot().values.title, "Edit B");
    await assert.rejects(
      view.render({ identity: "B", form: defineForm({ fields: { title: field.text() } }) }),
      /definition.*key/u,
    );
  } finally {
    await view.unmount();
  }
  await assert.rejects(
    mount(() => {
      binding.useFormSession(definition, { key: {} });
      return null;
    }),
    /key/u,
  );
});

test("reset and session replacement clear temporary numeric text even if the committed value is unchanged", async () => {
  const { Field } = createReactBinding({ text, number: NumberInput });
  const form = defineForm({ fields: { amount: field.number(), title: field.text() } });
  const session = createSession(form);
  const other = createSession(form);
  const view = await mount(({ current }) => h(Field, { session: current, name: "amount" }), {
    current: session,
  });
  try {
    await act(() => {
      view.container.querySelector("button").click();
    });
    assert.equal(view.container.querySelector("input").value, "-");
    await act(() => {
      session.edit("title", "Unrelated");
    });
    assert.equal(view.container.querySelector("input").value, "-");
    await act(() => {
      session.reset();
    });
    assert.equal(view.container.querySelector("input").value, "");
    await act(() => {
      view.container.querySelector("button").click();
    });
    await view.render({ current: other });
    assert.equal(view.container.querySelector("input").value, "");
    await act(() => {
      view.container.querySelectorAll("button")[1].click();
    });
    assert.equal(other.getSnapshot().values.amount, 12);
  } finally {
    await view.unmount();
  }
});

function NumberInput({ id, value, onChange }) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  return h(
    "div",
    null,
    h("input", { id, value: raw, readOnly: true }),
    h(
      "button",
      {
        onClick: () => {
          setRaw("-");
        },
      },
      "Incomplete",
    ),
    h(
      "button",
      {
        onClick: () => {
          onChange(12);
          setRaw("12");
        },
      },
      "Commit",
    ),
  );
}

test("Field rejects unknown names even when they match inherited properties", async () => {
  const session = createSession(definition);
  await assert.rejects(
    mount(() => h(binding.Field, { session, name: "toString" })),
    /Unknown field.*toString/u,
  );
});
