import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";
import { act, createElement as h, mount } from "./helpers/react.mjs";
import { exchange, exchangeFields, pair } from "./helpers/relations.mjs";
import { type } from "./helpers/rows-react.mjs";

const { Field } = createReactBinding({
  number: ({ name, value, onChange }) =>
    h("input", {
      name,
      value: value ?? "",
      onInput: (event) => onChange(Number(event.currentTarget.value)),
    }),
  select: ({ name, value, options, onChange }) =>
    h(
      "select",
      {
        name,
        value: value ?? "",
        onChange: (event) => onChange(event.currentTarget.value || null),
      },
      h("option", { value: "" }, "Automatic"),
      options.map((option) =>
        h("option", { key: option.value, value: option.value }, option.label),
      ),
    ),
});

test("Field uses the select renderer for the driver and publishes once per edit", async () => {
  const session = createSession(
    defineForm({
      fields: {
        foreign: exchangeFields.foreign,
        rate: exchangeFields.rate,
        local: exchangeFields.local,
        driver: field.select({
          label: "Driver",
          options: [
            { value: "rate", label: "Rate" },
            { value: "local", label: "Local" },
          ],
        }),
      },
      rules: { driver: exchange },
    }),
  );
  const view = await mount(() =>
    h("div", null, h(Field, { session, name: "driver" }), h(Field, { session, name: "local" })),
  );
  try {
    const select = view.container.querySelector("select");
    const local = view.container.querySelector("input");
    assert.deepEqual(
      [...select.options].map((option) => option.text),
      ["Automatic", "Rate", "Local"],
    );
    assert.equal(select.value, "");
    const published = [];
    session.subscribe(() => published.push(pair(session)));
    await type(local, "14600");
    assert.equal(select.value, "local");
    assert.deepEqual(published, [["local", 146, 14600]]);
    await act(() => {
      select.value = "";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(select.value, "");
    assert.deepEqual(published, [
      ["local", 146, 14600],
      [null, 146, 14600],
    ]);
  } finally {
    await view.unmount();
  }
});
