import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, initialFromQuery } from "trama-forms/react";
import { act, createElement as h, deferred, flush, mount } from "./helpers/react.mjs";
import { createQueryClient } from "./helpers/query.mjs";
import { instrumented, type } from "./helpers/rows-react.mjs";
import { keysOf } from "./helpers/session.mjs";

test("Field and Field with row publish once per keystroke when editing the debit with onEdit", async () => {
  const { Field } = instrumented();
  const fields = { debit: field.number(), credit: field.number({ default: 20 }) };
  const rules = { debit: { onEdit: () => ({ credit: 0 }) } };
  const session = createSession(
    defineForm({
      fields,
      collections: { lines: { fields } },
      rules: { ...rules, lines: { each: rules } },
    }),
    { initial: { lines: [{}] } },
  );
  const line = session.row("lines", keysOf(session)[0]);
  const view = await mount(() =>
    h("div", null, h(Field, { session, name: "debit" }), h(Field, { row: line, name: "debit" })),
  );
  try {
    const [header, row] = view.container.querySelectorAll("input");
    const seen = [];
    session.subscribe(() => {
      const { debit, credit } = session.getSnapshot().values;
      seen.push([{ debit, credit }, line.getSnapshot().values]);
    });
    await type(header, "5");
    await type(header, "50");
    await type(row, "3");
    await type(row, "30");
    assert.deepEqual(seen, [
      [
        { debit: 5, credit: 0 },
        { debit: null, credit: 20 },
      ],
      [
        { debit: 50, credit: 0 },
        { debit: null, credit: 20 },
      ],
      [
        { debit: 50, credit: 0 },
        { debit: 3, credit: 0 },
      ],
      [
        { debit: 50, credit: 0 },
        { debit: 30, credit: 0 },
      ],
    ]);
  } finally {
    await view.unmount();
  }
});

const address = defineForm({
  fields: {
    country: field.text(),
    city: field.text(),
    suggestedCity: field.text(),
    useSuggestion: field.checkbox(),
  },
  rules: {
    country: {
      onChange: ({ useSuggestion, suggestedCity }, { toDefaults }) =>
        useSuggestion ? { city: suggestedCity } : toDefaults("city"),
    },
  },
});
const { Field, useFormSession } = createReactBinding({
  text: ({ name, value, onChange }) =>
    h("input", {
      name,
      value,
      onInput: (event) => onChange(event.currentTarget.value),
    }),
  checkbox: ({ name, value, onChange }) =>
    h("input", {
      name,
      type: "checkbox",
      checked: value,
      onChange: (event) => onChange(event.currentTarget.checked),
    }),
});

function Editor({ request, other }) {
  const query = useQuery({ queryKey: ["address"], queryFn: () => request.promise });
  const editor = useFormSession(address, { initial: initialFromQuery(query) });
  if (editor.status !== "ready") return h("output", null, editor.status);
  return h(
    "div",
    null,
    h(Field, { session: editor.session, name: "country" }),
    h(Field, { session: editor.session, name: "suggestedCity" }),
    h(Field, { session: editor.session, name: "useSuggestion" }),
    h(Field, { session: editor.session, name: "city" }),
    h(Field, { session: editor.session, name: "city" }),
    h(Field, { session: other, name: "city" }),
    h("button", { onClick: editor.session.reset }, "Reset"),
  );
}

test("TanStack Query loads the country and city. Two views edit, clear, write, and restore without affecting another session", async () => {
  const client = createQueryClient();
  const request = deferred();
  const other = createSession(address, { initial: { city: "Independent" } });
  const view = await mount(() => h(QueryClientProvider, { client }, h(Editor, { request, other })));
  const cities = () =>
    [...view.container.querySelectorAll('[name="city"]')].map((input) => input.value);
  const edit = (name, value) =>
    act(() => {
      const input = view.container.querySelector(`[name="${name}"]`);
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  try {
    assert.equal(view.container.textContent, "loading");
    await act(() =>
      request.resolve({
        country: "ES",
        city: "Madrid",
        suggestedCity: "Mexico City",
        useSuggestion: false,
      }),
    );
    await flush();
    assert.deepEqual(cities(), ["Madrid", "Madrid", "Independent"]);
    await edit("city", "Barcelona");
    assert.deepEqual(cities(), ["Barcelona", "Barcelona", "Independent"]);
    await edit("country", "MX");
    assert.deepEqual(cities(), ["", "", "Independent"]);
    await act(() => view.container.querySelector('[name="useSuggestion"]').click());
    await edit("suggestedCity", "Tokyo");
    assert.deepEqual(cities(), ["", "", "Independent"]);
    await edit("country", "JP");
    assert.deepEqual(cities(), ["Tokyo", "Tokyo", "Independent"]);
    await act(() => client.setQueryData(["address"], { country: "MX", city: "Mexico City" }));
    await flush();
    assert.deepEqual(cities(), ["Tokyo", "Tokyo", "Independent"]);
    await act(() => view.container.querySelector("button").click());
    assert.equal(view.container.querySelector('[name="country"]').value, "ES");
    assert.deepEqual(cities(), ["Madrid", "Madrid", "Independent"]);
  } finally {
    await view.unmount();
    client.clear();
  }
});
