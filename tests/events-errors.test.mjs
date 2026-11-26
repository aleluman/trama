import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };
const countries = [
  { value: "ES", label: "Spain" },
  { value: "MX", label: "Mexico" },
  { value: "JP", label: "Japan" },
];

// quantity.onChange returns what the test asks for. In the same edit a formula
// writes total, another writes country and country.onChange writes early.
const returning = (result) =>
  defineForm({
    fields: {
      quantity: field.number({ default: 2 }),
      total: field.number(),
      early: field.text(),
      country: field.select({ options: countries, default: "ES" }),
      city: field.text(),
      done: field.checkbox(),
      level: field.number(),
    },
    rules: {
      total: { value: ({ quantity }) => (quantity ?? 0) * 10 },
      country: {
        value: ({ quantity }) => (quantity === 3 ? "MX" : undefined),
        onChange: () => ({ early: "Written" }),
      },
      quantity: { onChange: (values, tools) => result(values, tools) },
    },
  });

test("An event that throws rejects the entire operation and preserves the cause", () => {
  const boom = new Error("No capital");
  const session = createSession(
    returning(({ country }) => {
      if (country === "MX") throw boom;
      return { level: 1 };
    }),
  );
  rejects(
    session,
    () => session.edit("quantity", 3),
    'Field "quantity" onChange: event failed: No capital',
    boom,
  );
  // Opening does not run the event, so the failure arrives with the first edit.
  const opened = createSession(
    returning(() => {
      throw boom;
    }),
    { initial: { quantity: 3 } },
  );
  assert.equal(opened.getSnapshot().values.country, "MX");
  rejects(
    opened,
    () => opened.edit("quantity", 4),
    'Field "quantity" onChange: event failed: No capital',
    boom,
  );
  session.edit("quantity", 4);
  assert.deepEqual(session.getSnapshot().values, {
    quantity: 4,
    total: 40,
    early: "",
    country: "ES",
    city: "",
    done: false,
    level: 1,
  });
});

test("A result that is not a patch, an unknown key, or an incompatible value rejects the operation", () => {
  const cases = [
    [5, "expected a patch object, got 5"],
    [null, "expected a patch object, got null"],
    [false, "expected a patch object, got false"],
    ["city", 'expected a patch object, got "city"'],
    [[], "expected a patch object, got [object Array]"],
    [new Map(), "expected a patch object, got [object Map]"],
    [Promise.resolve({ level: 1 }), "expected a patch object, got [object Promise]"],
    [{ citi: "" }, 'unknown field "citi" in patch'],
    [{ toString: "" }, 'unknown field "toString" in patch'],
    [{ [Symbol("city")]: "" }, "unknown field Symbol(city) in patch"],
    [{ level: 1, city: null }, 'incompatible value null for text field "city"'],
    [{ done: "yes" }, 'incompatible value "yes" for checkbox field "done"'],
    [{ level: Number.NaN }, 'incompatible value NaN for number field "level"'],
    [{ level: Infinity }, 'incompatible value Infinity for number field "level"'],
    [{ country: "ZZ" }, 'incompatible value "ZZ" for select field "country"'],
    [Object.defineProperty({}, "citi", { value: "" }), 'unknown field "citi" in patch'],
  ];
  for (const [result, message] of cases) {
    const session = createSession(returning(() => result));
    rejects(session, () => session.edit("quantity", 3), `Field "quantity" onChange: ${message}`);
  }
});

test("toDefaults rejects unknown names even if the event catches the error, and values is read-only", () => {
  for (const name of ["citi", 1]) {
    const message = `Field "quantity" onChange: toDefaults: unknown field ${JSON.stringify(name)}`;
    for (const handler of [
      (_, { toDefaults }) => toDefaults("level", name),
      (_, { toDefaults }) => {
        try {
          return toDefaults(name);
        } catch {
          return {};
        }
      },
    ]) {
      const session = createSession(returning(handler));
      rejects(session, () => session.edit("quantity", 3), message);
    }
  }
  const session = createSession(
    returning((values) => {
      values.level = 1;
      return {};
    }),
  );
  assert.throws(
    () => session.edit("quantity", 3),
    (error) => {
      assert.equal(
        error.message,
        'Field "quantity" onChange: event failed: Event values are readonly',
      );
      assert.ok(error.cause instanceof TypeError);
      return true;
    },
  );
  const getter = createSession(
    returning(() => ({
      get level() {
        throw new Error("Getter failed");
      },
    })),
  );
  rejects(
    getter,
    () => getter.edit("quantity", 3),
    'Field "quantity" onChange: event failed: Getter failed',
  );
});

test("A failure an event reads is reported unwrapped, even if the event catches it", () => {
  const boom = new Error("No rate");
  for (const handler of [
    ({ rate }) => ({ level: rate }),
    (values) => {
      try {
        return { level: values.rate };
      } catch {
        return {};
      }
    },
  ]) {
    const definition = defineForm({
      fields: { zone: field.text(), rate: field.number(), level: field.number() },
      rules: {
        zone: { onChange: handler },
        rate: {
          value: ({ zone }) => {
            if (zone === "south") throw boom;
            return 10;
          },
        },
      },
    });
    const session = createSession(definition);
    rejects(
      session,
      () => session.edit("zone", "south"),
      'Field "rate" value: formula failed: No rate',
      boom,
    );
  }
});

test("An event whose writes change its own field again is rejected, including in a chain, between events, or when the writes converge", () => {
  const country = field.select({ options: countries, default: "ES" });
  for (const onChange of [
    () => ({ country: "JP" }),
    (_, { toDefaults }) => toDefaults("country"),
  ]) {
    const session = createSession(
      defineForm({ fields: { country }, rules: { country: { onChange } } }),
    );
    rejects(
      session,
      () => session.edit("country", "MX"),
      'Field "country" onChange: cyclic dependency country → country.onChange → country',
    );
  }

  const located = { Monterrey: "MX", Osaka: "JP" };
  const chain = defineForm({
    fields: { country, city: field.text() },
    rules: {
      country: {
        value: ({ city }) => located[city],
        onChange: ({ country: value }) => ({ city: value === null ? "" : capitals[value] }),
      },
    },
  });
  const session = createSession(chain);
  rejects(
    session,
    () => session.edit("city", "Monterrey"),
    'Field "country" onChange: cyclic dependency country.onChange → country → city → country.onChange',
  );

  // b.onChange writes back the value of the edit: the cycle is rejected although it converges.
  const events = defineForm({
    fields: { a: field.number(), b: field.number() },
    rules: {
      a: { onChange: ({ a }) => ({ b: (a ?? 0) + 1 }) },
      b: { onChange: ({ b }) => ({ a: (b ?? 0) - 1 }) },
    },
  });
  const pair = createSession(events);
  rejects(
    pair,
    () => pair.edit("a", 5),
    'Field "b" onChange: cyclic dependency b.onChange → b → a.onChange → a → b.onChange',
  );
});

test("An event that reads a field it writes or a formula that depends on itself through an event creates a cycle", () => {
  const onChange = ({ country, city }) => ({ city: city === "" ? capitals[country] : city });
  for (const [fields, message] of [
    [
      { country: field.select({ options: countries, default: "ES" }), city: field.text() },
      'Field "country" onChange: cyclic dependency country.onChange → city → country.onChange',
    ],
    [
      { city: field.text(), country: field.select({ options: countries, default: "ES" }) },
      'Field "country" onChange: cyclic dependency city → country.onChange → city',
    ],
  ]) {
    const session = createSession(defineForm({ fields, rules: { country: { onChange } } }));
    rejects(session, () => session.edit("country", "MX"), message);
  }

  const through = defineForm({
    fields: {
      total: field.number(),
      city: field.text(),
      country: field.select({ options: countries, default: "ES" }),
    },
    rules: {
      total: { value: ({ city }) => city.length },
      country: {
        value: ({ total }) => ((total ?? 0) > 5 ? "MX" : "ES"),
        onChange: ({ country }) => ({ city: capitals[country] }),
      },
    },
  });
  const session = createSession(through);
  rejects(
    session,
    () => session.edit("city", "Barcelona"),
    'Field "country" onChange: cyclic dependency country.onChange → country → total → city → country.onChange',
  );
});

test("Without type checking, defineForm rejects an event that is not a function and omits onChange when it is undefined", () => {
  const fields = { country: field.select({ options: countries }), city: field.text() };
  for (const onChange of [1, null, {}, [() => ({})]])
    assert.throws(() => defineForm({ fields, rules: { country: { onChange } } }), {
      message: 'Field "country" onChange: event must be a function',
    });
  const absent = createSession(defineForm({ fields, rules: { country: { onChange: undefined } } }));
  absent.edit("country", "MX");
  assert.deepEqual(absent.getSnapshot().values, { country: "MX", city: "" });
});
