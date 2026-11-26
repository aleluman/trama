import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };
const shipping = () =>
  defineForm({
    fields: {
      country: field.select({
        options: [
          { value: "ES", label: "Spain" },
          { value: "MX", label: "Mexico" },
          { value: "JP", label: "Japan" },
        ],
        default: "ES",
      }),
      city: field.text({ label: "City" }),
    },
    rules: {
      city: {
        label: ({ country }) => (country === "ES" ? "Municipality" : undefined),
        placeholder: ({ country }) => (country === null ? undefined : `E.g., ${capitals[country]}`),
      },
    },
  });

test("city is labeled Municipality in Spain, falls back to the definition label in other countries, and suggests the capital", () => {
  const session = createSession(shipping());
  const city = () => session.getSnapshot().fieldStates.city;
  assert.deepEqual([city().label, city().placeholder], ["Municipality", "E.g., Madrid"]);
  session.edit("country", "MX");
  assert.deepEqual([city().label, city().placeholder], ["City", "E.g., Mexico City"]);
  session.edit("country", null);
  assert.deepEqual([city().label, city().placeholder], ["City", undefined]);
  session.reset();
  assert.deepEqual([city().label, city().placeholder], ["Municipality", "E.g., Madrid"]);
  const supplied = createSession(shipping(), { initial: { country: "JP" } });
  assert.equal(supplied.getSnapshot().fieldStates.city.placeholder, "E.g., Tokyo");
});

// Three switches decide the label of city from three positions: the entry of
// before, the entry of city and the entry of after, in declaration order.
const layered = () =>
  defineForm({
    fields: {
      before: field.text(),
      city: field.text({ label: "Definition", placeholder: "Enter" }),
      after: field.text(),
    },
    rules: {
      before: {
        states: ({ before }) =>
          before === "" ? undefined : { city: { label: before, placeholder: before } },
      },
      city: {
        label: ({ city }) => (city === "" ? undefined : city),
        placeholder: ({ city }) => (city === "" ? undefined : city),
      },
      after: {
        states: ({ after }) =>
          after === "" ? undefined : { city: { label: after, placeholder: after } },
      },
    },
  });

test("the last declared contribution returning a string takes precedence; undefined falls back to the previous contribution and ultimately to the definition", () => {
  const session = createSession(layered());
  const city = () => {
    const { label, placeholder } = session.getSnapshot().fieldStates.city;
    assert.equal(placeholder, label === "Definition" ? "Enter" : label);
    return label;
  };
  assert.equal(city(), "Definition");
  session.edit("after", "After");
  session.edit("city", "Own");
  session.edit("before", "Before");
  assert.equal(city(), "After", "The order follows declaration regardless of evaluation order");
  session.edit("after", "");
  assert.equal(city(), "Own");
  session.edit("city", "");
  assert.equal(city(), "Before");
  session.edit("before", "");
  assert.equal(city(), "Definition");
  session.edit("city", "Own");
  assert.equal(city(), "Own");
});

test('"" is a value that clears the label or placeholder; undefined removes the contribution', () => {
  const session = createSession(layered());
  const city = () => session.getSnapshot().fieldStates.city;
  session.edit("before", "Before");
  const definition = defineForm({
    fields: {
      clear: field.checkbox(),
      title: field.text({ label: "Title", placeholder: "Untitled" }),
      total: field.number({ label: "Total" }),
      done: field.checkbox({ label: "Ready" }),
    },
    rules: {
      title: {
        label: ({ clear }) => (clear ? "" : undefined),
        placeholder: ({ clear }) => (clear ? "" : undefined),
      },
      clear: {
        states: ({ clear }) => (clear ? { total: { label: "" }, done: { label: "" } } : {}),
      },
    },
  });
  const cleared = createSession(definition);
  cleared.edit("clear", true);
  const { title, total, done } = cleared.getSnapshot().fieldStates;
  assert.deepEqual([title.label, title.placeholder, total.label, done.label], ["", "", "", ""]);
  cleared.edit("clear", false);
  assert.deepEqual(
    [cleared.getSnapshot().fieldStates.title.label, cleared.getSnapshot().fieldStates.done.label],
    ["Title", "Ready"],
  );
  assert.equal(city().label, "Before");
});

test("a field with no label or placeholder in the definition publishes undefined until a rule contributes text", () => {
  const definition = defineForm({
    fields: { amount: field.number(), label: field.text() },
    rules: {
      amount: {
        label: ({ label }) => (label === "" ? undefined : label),
        placeholder: ({ label }) => (label === "" ? undefined : `${label}…`),
      },
    },
  });
  const session = createSession(definition);
  assert.deepEqual(
    [
      session.getSnapshot().fieldStates.amount.label,
      session.getSnapshot().fieldStates.amount.placeholder,
    ],
    [undefined, undefined],
  );
  session.edit("label", "Amount");
  assert.deepEqual(
    [
      session.getSnapshot().fieldStates.amount.label,
      session.getSnapshot().fieldStates.amount.placeholder,
    ],
    ["Amount", "Amount…"],
  );
});
