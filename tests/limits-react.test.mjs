import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";

const form = defineForm({
  fields: {
    currency: field.text(),
    price: field.number({ decimals: 0, min: 0 }),
    from: field.date(),
    to: field.date({ max: "2026-12-31" }),
    note: field.text(),
  },
  rules: {
    price: { decimals: ({ currency }) => (currency === "USD" ? 2 : undefined) },
    to: { min: ({ from }) => from },
  },
});

// Each renderer records the props it committed, by field name.
const recording = () => {
  const renders = {};
  const recorder = function Recorded(props) {
    useLayoutEffect(() => {
      (renders[props.name] ??= []).push(props);
    });
    return h("output", { name: props.name }, String(props.value));
  };
  const binding = createReactBinding({ text: recorder, number: recorder, date: recorder });
  return { ...binding, last: (name) => renders[name].at(-1), renders };
};

const pick = ({ decimals, min, max }) => ({ decimals, min, max });

test("the renderer receives decimals and limits from state, with undefined for those it does not have", async () => {
  const { Field, last, renders } = recording();
  const session = createSession(form);
  const view = await mount(() =>
    h("div", null, [
      h(Field, { key: "price", session, name: "price" }),
      h(Field, { key: "to", session, name: "to" }),
      h(Field, { key: "note", session, name: "note" }),
    ]),
  );
  assert.deepEqual(pick(last("price")), { decimals: 0, min: 0, max: undefined });
  assert.deepEqual(pick(last("to")), { decimals: undefined, min: undefined, max: "2026-12-31" });
  assert.equal("decimals" in last("to"), false, "A date has no decimals");
  assert.equal("min" in last("note"), false, "A text field has no limits");
  await act(() => session.edit("currency", "USD"));
  assert.equal(last("price").decimals, 2);
  await act(() => session.edit("from", "2026-03-01"));
  assert.equal(last("to").min, "2026-03-01");
  const rendered = renders.to.length;
  await act(() => session.edit("note", "No changes in to"));
  assert.equal(renders.to.length, rendered, "Unchanged state does not rerender");
  await view.unmount();
});
