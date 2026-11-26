import assert from "node:assert/strict";
import { test } from "node:test";
import { useEffect, useLayoutEffect } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

// The controller of a view lives while its renderer is mounted. A field that
// hides unmounts its renderer, and its text: the binding disposes its
// controller after that commit. A message that arrives once the Field left
// does not stay. In StrictMode React mounts the effects twice, and one
// controller remains.
const trip = defineForm({
  fields: { hide: field.number(), until: field.date() },
  collections: { legs: { fields: { skip: field.number(), day: field.date() } } },
  rules: {
    until: { hidden: ({ hide }) => hide === 1 },
    legs: { each: { day: { hidden: ({ skip }) => skip === 1 } } },
  },
});
const recording = (renders) =>
  function Input(props) {
    useLayoutEffect(() => {
      renders.push(props);
    });
    return h("input", { name: props.name, value: String(props.value ?? "") });
  };
const bindingOf = (renders) =>
  createReactBinding({ date: recording(renders), number: recording(renders) });
const last = (renders, name) => renders.findLast((props) => props.name === name);
const pending = (session) => session.getSnapshot().form.inputPending;
// Lets the microtasks that follow a commit or a late message run.
const settled = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
// Counts the controllers a session creates.
const counted = (session) => {
  const created = { count: 0 };
  const input = session.input;
  session.input = (name) => {
    created.count += 1;
    return input(name);
  };
  return created;
};
// A renderer restored with a draft reports it as it mounts.
const Restored = ({ onInputError }) => {
  useEffect(() => {
    onInputError("Pending draft");
  }, [onInputError]);
  return null;
};
// A renderer that reports its draft as it unmounts.
const Leaving = ({ onInputError }) => {
  useEffect(() => () => onInputError("Unconverted draft"), [onInputError]);
  return null;
};

test("hiding a field discards its renderer's controller, and showing it again reveals no error", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const view = await mount(() => h(Field, { session, name: "until" }));
  try {
    await act(() => {
      last(renders, "until").onInputError("Incomplete date");
    });
    assert.equal(pending(session), true);
    await act(() => {
      session.edit("hide", 1);
    });
    await settled();
    assert.equal(view.container.querySelector("input"), null);
    assert.equal(pending(session), false);
    assert.deepEqual(session.getSnapshot().fieldStates.until.errors, []);
    await act(() => {
      session.edit("hide", null);
    });
    assert.deepEqual(session.getSnapshot().fieldStates.until.errors, []);
    // The renderer mounted again reports with a new controller.
    await act(() => {
      last(renders, "until").onInputError("Again");
    });
    assert.equal(pending(session), true);
  } finally {
    await view.unmount();
  }
  assert.equal(pending(session), false);
});

test("hiding a cell discards its renderer's controller", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip, { initial: { legs: [{}] } });
  const row = session.row("legs", session.getSnapshot().rows.legs[0]);
  const view = await mount(() => h(Field, { row, name: "day" }));
  try {
    await act(() => {
      last(renders, "day").onInputError("Incomplete day");
    });
    assert.equal(pending(session), true);
    await act(() => {
      row.edit("skip", 1);
    });
    await settled();
    assert.equal(pending(session), false);
    assert.deepEqual(row.getSnapshot().fieldStates.day.errors, []);
  } finally {
    await view.unmount();
  }
});

test("a message that arrives after unmounting leaves no controller", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const view = await mount(() => h(Field, { session, name: "until" }));
  const { onInputError } = last(renders, "until");
  await view.unmount();
  onInputError("Incomplete date");
  await settled();
  assert.equal(pending(session), false);
  assert.deepEqual(session.getSnapshot().fieldStates.until.errors, []);
});

test("a renderer that reports as it unmounts leaves no controller", async () => {
  const { Field } = createReactBinding({ date: Leaving, number: Leaving });
  const session = createSession(trip);
  const view = await mount(() => h(Field, { session, name: "until" }));
  assert.equal(pending(session), false);
  await view.unmount();
  await settled();
  assert.equal(pending(session), false);
});

test("in StrictMode, a renderer that reports from its mount effect leaves only one controller", async () => {
  const { Field } = createReactBinding({ date: Restored, number: Restored });
  const session = createSession(trip);
  const created = counted(session);
  const view = await mount(() => h(Field, { session, name: "until" }), {}, { strict: true });
  try {
    await settled();
    // React mounts the effects twice: the first controller goes with the first subscription.
    assert.equal(created.count, 2);
    assert.equal(pending(session), true);
    assert.deepEqual(session.getSnapshot().fieldStates.until.errors, ["Pending draft"]);
  } finally {
    await view.unmount();
  }
  assert.equal(pending(session), false);
});
