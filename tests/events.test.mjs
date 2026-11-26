import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };
const countries = [
  { value: "ES", label: "Spain" },
  { value: "MX", label: "Mexico" },
  { value: "JP", label: "Japan" },
];
const orderWith = (onCountry) =>
  defineForm({
    fields: {
      customer: field.text({ label: "Customer" }),
      quantity: field.number({ label: "Quantity", default: 2 }),
      price: field.number({ label: "Unit price", default: 5000 }),
      total: field.number({ label: "Net total" }),
      country: field.select({ label: "Delivery country", options: countries, default: "ES" }),
      city: field.text({ label: "City" }),
      useCapital: field.checkbox({ label: "Use the capital when the country changes" }),
    },
    rules: {
      total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
      country: {
        onChange: (values, tools) => {
          onCountry(values);
          const { country, useCapital } = values;
          return useCapital && country !== null
            ? { city: capitals[country] }
            : tools.toDefaults("city");
        },
      },
    },
  });

test("A country change resets the city to its default or selects the capital. Opening and reset do not run the event", () => {
  const seen = [];
  const order = orderWith(({ country, useCapital }) => seen.push({ country, useCapital }));
  const session = createSession(order, { initial: { city: "Barcelona" } });
  const other = createSession(order);
  assert.equal(session.getSnapshot().values.city, "Barcelona");
  session.edit("country", "MX");
  assert.equal(
    session.getSnapshot().values.city,
    "",
    "The definition's default takes precedence over the baseline",
  );
  session.edit("useCapital", true);
  assert.equal(session.getSnapshot().values.city, "");
  session.edit("country", "JP");
  assert.equal(session.getSnapshot().values.city, "Tokyo");
  session.edit("city", "Osaka");
  session.edit("country", "JP");
  assert.equal(session.getSnapshot().values.city, "Osaka");
  session.edit("country", null);
  assert.equal(session.getSnapshot().values.city, "");
  assert.deepEqual(seen, [
    { country: "MX", useCapital: false },
    { country: "JP", useCapital: true },
    { country: null, useCapital: true },
  ]);
  session.reset();
  assert.deepEqual(session.getSnapshot().values, {
    customer: "",
    quantity: 2,
    price: 5000,
    total: 10000,
    country: "ES",
    city: "Barcelona",
    useCapital: false,
  });
  assert.equal(other.getSnapshot().values.city, "");
  assert.equal(seen.length, 3);
  session.edit("country", "MX");
  assert.equal(session.getSnapshot().values.city, "");
  assert.equal(seen.length, 4);
});

test("A formula that changes the field on opening, a supplied value, reset, and an edit with no difference do not run events", () => {
  let calls = 0;
  const definition = defineForm({
    fields: {
      source: field.number({ default: 1 }),
      mode: field.text({ default: "manual" }),
      log: field.text(),
    },
    rules: {
      mode: {
        value: ({ source }) => ((source ?? 0) > 0 ? "auto" : "manual"),
        onChange: ({ mode }) => {
          calls++;
          return { log: `Mode ${mode}` };
        },
      },
    },
  });
  const session = createSession(definition);
  createSession(definition, { initial: { mode: "manual", source: 5 } });
  assert.deepEqual(session.getSnapshot().values, { source: 1, mode: "auto", log: "" });
  session.edit("source", 2);
  session.edit("mode", "auto");
  assert.equal(calls, 0);
  session.edit("source", 0);
  assert.deepEqual(session.getSnapshot().values, { source: 0, mode: "manual", log: "Mode manual" });
  session.reset();
  assert.equal(calls, 1);
  assert.deepEqual(session.getSnapshot().values, { source: 1, mode: "auto", log: "" });
});

// Each field type with and without a declared default. The author's objects
// change after defineForm, which must not reach the definition.
const accountFields = () => {
  const city = field.text({ default: "No city" });
  const entry = {
    onChange: ({ account }, { toDefaults }) =>
      account === ""
        ? toDefaults("text", "flag", "number", "select", "zero", "on", "city", "level")
        : { ...toDefaults("text", "flag", "number"), text: account, flag: undefined },
  };
  const definition = defineForm({
    fields: {
      account: field.text(),
      text: field.text(),
      flag: field.checkbox(),
      number: field.number(),
      select: field.select({ options: [{ value: "ready", label: "Ready" }] }),
      zero: field.number({ default: 0 }),
      on: field.checkbox({ default: true }),
      city,
      level: field.select({
        options: [1, 2].map((value) => ({ value, label: `${value}` })),
        default: 2,
      }),
    },
    rules: { account: entry },
  });
  city.default = "Mutated";
  entry.onChange = () => ({ text: "Mutated" });
  return definition;
};

test("An event writes multiple destinations. toDefaults uses each type's default and empty values and composes with spread", () => {
  const saved = {
    account: "Initial",
    text: "Saved",
    flag: true,
    number: 17,
    select: "ready",
    zero: 8,
    on: false,
    city: "Barcelona",
    level: 1,
  };
  const session = createSession(accountFields(), { initial: saved });
  session.edit("account", "New");
  assert.deepEqual(session.getSnapshot().values, {
    ...saved,
    account: "New",
    text: "New",
    number: null,
  });
  session.edit("account", "");
  assert.deepEqual(session.getSnapshot().values, {
    account: "",
    text: "",
    flag: false,
    number: null,
    select: null,
    zero: 0,
    on: true,
    city: "No city",
    level: 2,
  });
});

test("An event sees resolved values, including values written by later-declared rules", () => {
  const rates = { ES: 170, MX: 8, JP: 1 };
  for (const rateFirst of [false, true]) {
    const seen = [];
    const fields = {
      country: field.select({ options: countries, default: "ES" }),
      summary: field.text(),
    };
    const rate = field.number();
    const definition = defineForm({
      fields: rateFirst ? { rate, ...fields } : { ...fields, rate },
      rules: {
        country: {
          onChange: ({ country, rate: current }) => {
            seen.push(current);
            return { summary: `${country}: ${current}` };
          },
        },
        rate: { value: ({ country }) => (country === null ? null : rates[country]) },
      },
    });
    const session = createSession(definition);
    session.edit("country", "MX");
    assert.equal(session.getSnapshot().values.summary, "MX: 8");
    session.edit("country", "JP");
    assert.equal(session.getSnapshot().values.summary, "JP: 1");
    assert.deepEqual(seen, [8, 1], "One invocation per operation with final values");
  }
});

test("An event → formula → event cascade exposes no intermediate values in any field order", () => {
  const currencies = { ES: "EUR", MX: "MXN", JP: "JPY" };
  const rates = { EUR: 170, MXN: 8, JPY: 1 };
  const fields = {
    country: field.select({ options: countries, default: "JP" }),
    currency: field.text({ default: "JPY" }),
    rate: field.number(),
    note: field.text(),
  };
  for (const names of [Object.keys(fields), Object.keys(fields).toReversed()]) {
    const calls = { country: 0, rate: 0 };
    const definition = defineForm({
      fields: Object.fromEntries(names.map((name) => [name, fields[name]])),
      rules: {
        country: {
          onChange: ({ country }) => {
            calls.country++;
            return { currency: country === null ? "" : currencies[country] };
          },
        },
        rate: {
          value: ({ currency }) => rates[currency] ?? null,
          onChange: ({ rate, currency }) => {
            calls.rate++;
            return { note: `1 ${currency} = ${rate} JPY` };
          },
        },
      },
    });
    const session = createSession(definition);
    const observed = [];
    session.subscribe(() => observed.push(session.getSnapshot().values));
    session.edit("country", "MX");
    assert.deepEqual(observed, [
      { country: "MX", currency: "MXN", rate: 8, note: "1 MXN = 8 JPY" },
    ]);
    assert.deepEqual(calls, { country: 1, rate: 1 });
  }
});

test("An event does not run if its field returns to its previous value within the operation", () => {
  const fields = {
    x: field.number({ default: 0 }),
    t: field.number({ default: 0 }),
    log: field.text(),
  };
  const t = { value: ({ x }) => x, onChange: ({ t: value }) => ({ log: `t = ${value}` }) };
  const x = { onChange: () => ({ t: 0 }) };
  // x.onChange is declared last: it writes t back to 0, so t never changed.
  const restored = createSession(defineForm({ fields, rules: { t, x } }));
  restored.edit("x", 5);
  assert.deepEqual(restored.getSnapshot().values, { x: 5, t: 0, log: "" });
  // The formula is declared last: t changes and its event runs.
  const changed = createSession(defineForm({ fields, rules: { x, t } }));
  changed.edit("x", 5);
  assert.deepEqual(changed.getSnapshot().values, { x: 5, t: 5, log: "t = 5" });
});
