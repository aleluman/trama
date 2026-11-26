import assert from "node:assert/strict";
import { test } from "node:test";
import { useLayoutEffect } from "react";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";

const families = [
  { value: 1, label: "Beverages" },
  { value: 2, label: "Dairy" },
  { value: 3, label: "Bakery" },
];
const catalog = defineEndpoints({ families: endpoint.list(() => Promise.resolve(families)) });
const { defineForm, field } = createForms({ endpoints: [catalog] });
const report = defineForm({
  fields: {
    from: field.date({ placeholder: "YYYY-MM-DD" }),
    kinds: field.multiSelect({
      options: [
        { value: "sale", label: "Sale" },
        { value: "quote", label: "Quote" },
      ],
    }),
    families: field.multiAsync("families", { placeholder: "All" }),
    freeze: field.checkbox(),
  },
  rules: { families: { readOnly: ({ freeze }) => freeze } },
});

// Each renderer records the props it committed, by field type.
const recording = () => {
  const renders = { date: [], multiSelect: [], multiAsync: [] };
  const recorder = (type) =>
    function Recorded(props) {
      useLayoutEffect(() => {
        renders[type].push(props);
      });
      return h("output", { name: props.name }, JSON.stringify(props.value));
    };
  const binding = createReactBinding({
    date: recorder("date"),
    multiSelect: recorder("multiSelect"),
    multiAsync: recorder("multiAsync"),
    checkbox: () => null,
  });
  return { ...binding, last: (type) => renders[type].at(-1), renders };
};
const fields = (Field, session) =>
  h("div", null, [
    h(Field, { key: "from", session, name: "from" }),
    h(Field, { key: "kinds", session, name: "kinds" }),
    h(Field, { key: "families", session, name: "families" }),
  ]);

test("Each type receives its value and props, including the date's placeholder, the multi-select's options, and the remote multi-select's list", async () => {
  const { loader, calls } = scriptedLoader();
  const { Field, last } = recording();
  const session = createSession(report, { scope: "acme", loader });
  const view = await mount(() => fields(Field, session));
  assert.equal(last("date").value, null);
  assert.equal(last("date").placeholder, "YYYY-MM-DD");
  assert.deepEqual(last("multiSelect").value, []);
  assert.deepEqual(
    last("multiSelect").options.map((option) => option.value),
    ["sale", "quote"],
  );
  assert.equal("placeholder" in last("multiSelect"), false);
  assert.equal(last("multiAsync").placeholder, "All");
  assert.equal(last("multiAsync").list.status, "idle");
  await act(() => last("multiAsync").list.open());
  await act(() => calls[0].resolve());
  const { options } = last("multiAsync").list;
  assert.deepEqual(
    options.map((option) => option.label),
    families.map((family) => family.label),
  );
  await act(() => last("multiAsync").onChange([options[2], options[0]]));
  await act(() => last("multiSelect").onChange(["quote"]));
  await act(() => last("date").onChange("2026-10-22"));
  const { values } = session.getSnapshot();
  assert.equal(values.families[0], options[2]);
  assert.deepEqual(values.kinds, ["quote"]);
  assert.equal(values.from, "2026-10-22");
  assert.equal(last("multiAsync").value, values.families);
  await view.unmount();
});

test("The same set in a different order does not render again, and the binding ignores onChange when read-only", async () => {
  const { Field, last, renders } = recording();
  const session = createSession(report, {
    scope: "acme",
    initial: { families: [families[0], families[1]] },
  });
  const view = await mount(() => fields(Field, session));
  const before = renders.multiAsync.length;
  const held = last("multiAsync").value;
  await act(() => last("multiAsync").onChange([held[1], held[0]]));
  assert.equal(renders.multiAsync.length, before);
  assert.equal(session.getSnapshot().values.families, held);
  await act(() => session.edit("freeze", true));
  assert.equal(last("multiAsync").readOnly, true);
  await act(() => last("multiAsync").onChange([]));
  assert.equal(session.getSnapshot().values.families, held);
  await view.unmount();
});
