import assert from "node:assert/strict";
import { test } from "node:test";
import { useEffect, useLayoutEffect } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

// onInputError reports the text a renderer could not convert. The binding
// creates the controller of the view at the first message, never while
// rendering, and disposes it when the view unmounts or changes session, name
// or reset. A renderer calls onChange(value) and then onInputError(undefined):
// if the write fails, the error stays.
const trip = defineForm({
  fields: {
    since: field.date({ required: true }),
    until: field.date(),
    check: field.number(),
  },
  rules: {
    check: {
      value: ({ until }) => {
        if (until === "2000-01-01") throw new Error("Invalid date");
        return until === null ? null : until.length;
      },
    },
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
const pending = (session) => session.getSnapshot().form.inputPending;

test("onInputError creates the controller with the first message, and the error belongs to its field", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip, { initial: { since: "2026-01-01" } });
  const created = counted(session);
  const view = await mount(() => h(Field, { session, name: "since" }));
  try {
    // Mounting and withdrawing nothing create no controller.
    await act(() => {
      last(renders, "since").onInputError();
    });
    assert.equal(created.count, 0);
    await act(() => {
      last(renders, "since").onInputError("Incomplete date");
    });
    assert.equal(created.count, 1);
    assert.equal(pending(session), true);
    assert.deepEqual(session.getSnapshot().fieldStates.since.errors, ["Incomplete date"]);
    // A local error: visible once the field is touched.
    assert.deepEqual(last(renders, "since").errors, []);
    await act(() => {
      last(renders, "since").onBlur();
    });
    assert.deepEqual(last(renders, "since").errors, ["Incomplete date"]);
    // The renderer converts the text: it writes the value and withdraws the error.
    await act(() => {
      last(renders, "since").onChange("2026-02-03");
      last(renders, "since").onInputError();
    });
    assert.equal(pending(session), false);
    assert.equal(session.getSnapshot().values.since, "2026-02-03");
    assert.equal(created.count, 1);
  } finally {
    await view.unmount();
  }
});

test("if the write fails, the input error remains", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const view = await mount(() => h(Field, { session, name: "until" }));
  try {
    await act(() => {
      last(renders, "until").onInputError("Incomplete date");
    });
    await act(() => {
      assert.throws(() => {
        last(renders, "until").onChange("2000-01-01");
        last(renders, "until").onInputError();
      }, /Invalid date/u);
    });
    assert.equal(pending(session), true);
    assert.equal(session.getSnapshot().values.until, null);
  } finally {
    await view.unmount();
  }
});

test("unmounting a view disposes its controller while views of another field retain theirs", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const view = await mount(
    ({ both }) =>
      h(
        "div",
        null,
        both ? h(Field, { session, name: "since" }) : null,
        h(Field, { session, name: "until" }),
      ),
    { both: true },
  );
  try {
    await act(() => {
      last(renders, "since").onInputError("Incomplete date");
      last(renders, "until").onInputError("Another incomplete date");
    });
    await view.render({ both: false });
    assert.deepEqual(session.getSnapshot().fieldStates.since.errors, ["Required"]);
    assert.deepEqual(session.getSnapshot().fieldStates.until.errors, ["Another incomplete date"]);
    assert.equal(pending(session), true);
  } finally {
    await view.unmount();
  }
  assert.equal(pending(session), false);
});

test("changing the name or session disposes only the previous controller", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const other = createSession(trip);
  const view = await mount(({ source, name }) => h(Field, { session: source, name }), {
    source: session,
    name: "since",
  });
  try {
    await act(() => {
      last(renders, "since").onInputError("Incomplete date");
    });
    session.input("since").error("From another view");
    await view.render({ source: session, name: "until" });
    assert.deepEqual(session.getSnapshot().fieldStates.since.errors, [
      "From another view",
      "Required",
    ]);
    await act(() => {
      last(renders, "until").onInputError("Another incomplete date");
    });
    await view.render({ source: other, name: "until" });
    assert.deepEqual(session.getSnapshot().fieldStates.until.errors, []);
    assert.equal(pending(other), false);
  } finally {
    await view.unmount();
  }
});

test("reset remounts the renderer and discards its controller, and the next message creates a new one", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const created = counted(session);
  const view = await mount(() => h(Field, { session, name: "since" }));
  try {
    await act(() => {
      last(renders, "since").onInputError("Incomplete date");
    });
    const before = last(renders, "since");
    await act(() => {
      session.reset();
    });
    assert.equal(pending(session), false);
    assert.notEqual(last(renders, "since"), before);
    await act(() => {
      last(renders, "since").onInputError("Again");
    });
    assert.equal(created.count, 2);
    assert.equal(pending(session), true);
  } finally {
    await view.unmount();
  }
  assert.equal(pending(session), false);
});

test("in StrictMode no controllers remain, and rendering creates none", async () => {
  const renders = [];
  const { Field } = bindingOf(renders);
  const session = createSession(trip);
  const created = counted(session);
  const view = await mount(() => h(Field, { session, name: "since" }), {}, { strict: true });
  try {
    assert.equal(created.count, 0);
    await act(() => {
      last(renders, "since").onInputError("Incomplete date");
    });
    assert.equal(created.count, 1);
  } finally {
    await view.unmount();
  }
  assert.equal(pending(session), false);
});

// A renderer restored with a draft reports it as it mounts, before the Field subscribes.
const Draft = ({ onInputError }) => {
  useEffect(() => {
    onInputError("Pending draft");
  }, [onInputError]);
  return null;
};

test("a renderer that reports from its mount effect retains its pending input until it unmounts", async () => {
  const { Field } = createReactBinding({ date: Draft, number: Draft });
  const session = createSession(trip);
  const view = await mount(() => h(Field, { session, name: "until" }));
  try {
    assert.equal(pending(session), true);
    assert.deepEqual(session.getSnapshot().fieldStates.until.errors, ["Pending draft"]);
  } finally {
    await view.unmount();
  }
  assert.equal(pending(session), false);
});
