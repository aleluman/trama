import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { rejects } from "./helpers/session.mjs";

const fields = () => ({
  delivery: field.text(),
  city: field.text(),
  total: field.number(),
  useCapital: field.checkbox(),
  country: field.select({ options: [{ value: "ES", label: "Spain" }] }),
});
// A definition whose states patch returns result once delivery is "x".
const returning = (result) =>
  defineForm({
    fields: fields(),
    rules: { delivery: { states: ({ delivery }) => (delivery === "x" ? result() : undefined) } },
  });
const reason = "expected a boolean, a non-empty reason or undefined";

// Opening and editing both reject the patch with the same diagnostic.
const rejected = (result, message) => {
  const definition = returning(result);
  const session = createSession(definition);
  rejects(session, () => session.edit("delivery", "x"), `Field "delivery" states: ${message}`);
  assert.throws(() => createSession(definition, { initial: { delivery: "x" } }), {
    message: `Field "delivery" states: ${message}`,
  });
};

test("a patch that is not an object of targets rejects the operation and names the target", () => {
  const symbol = Symbol("city");
  for (const [result, message] of [
    [() => 5, "expected a state patch object, got 5"],
    [() => null, "expected a state patch object, got null"],
    [() => false, "expected a state patch object, got false"],
    [() => [], "expected a state patch object, got [object Array]"],
    [() => Promise.resolve({}), "expected a state patch object, got [object Promise]"],
    [() => ({ citi: { hidden: true } }), 'unknown field "citi"'],
    [() => ({ citi: undefined }), 'unknown field "citi"'],
    [() => ({ [symbol]: { hidden: true } }), "unknown field Symbol(city)"],
    [() => ({ city: true }), 'expected an object of state properties for field "city", got true'],
    [() => ({ city: null }), 'expected an object of state properties for field "city", got null'],
    [
      () => ({ city: [{ hidden: true }] }),
      'expected an object of state properties for field "city", got [object Array]',
    ],
  ])
    rejected(result, message);
});

test("an unknown property, an unavailable placeholder, or an incompatible value names the target and the property", () => {
  const symbol = Symbol("hidden");
  for (const [result, message] of [
    [() => ({ city: { value: "Madrid" } }), 'unknown property "value" for field "city"'],
    [() => ({ city: { hiden: true } }), 'unknown property "hiden" for field "city"'],
    [() => ({ city: { [symbol]: true } }), 'unknown property Symbol(hidden) for field "city"'],
    [
      () => ({ useCapital: { placeholder: "Yes" } }),
      'checkbox field "useCapital" has no placeholder',
    ],
    [() => ({ country: { placeholder: undefined } }), 'select field "country" has no placeholder'],
    [
      () => ({ city: { hidden: 5 } }),
      'incompatible hidden 5 for field "city", expected a boolean or undefined',
    ],
    [
      () => ({ city: { required: "" } }),
      'incompatible required "" for field "city", expected a boolean, a non-empty message or undefined',
    ],
    [() => ({ city: { disabled: "" } }), `incompatible disabled "" for field "city", ${reason}`],
    [
      () => ({ total: { readOnly: null } }),
      `incompatible readOnly null for field "total", ${reason}`,
    ],
    [
      () => ({ city: { label: 0 } }),
      'incompatible label 0 for field "city", expected a string or undefined',
    ],
    [
      () => ({ total: { placeholder: true } }),
      'incompatible placeholder true for field "total", expected a string or undefined',
    ],
  ])
    rejected(result, message);
});

test("a state patch that throws, including from a getter, rejects the operation with its cause", () => {
  const boom = new Error("No state");
  for (const result of [
    () => {
      throw boom;
    },
    () => ({
      get city() {
        throw boom;
      },
    }),
    () => ({
      city: {
        get hidden() {
          throw boom;
        },
      },
    }),
  ]) {
    const session = createSession(returning(result));
    rejects(
      session,
      () => session.edit("delivery", "x"),
      'Field "delivery" states: formula failed: No state',
      boom,
    );
  }
});

test("values and peek are read-only in states", () => {
  const definition = defineForm({
    fields: fields(),
    rules: {
      city: {
        states: (_, { peek }) => {
          peek.city = "x";
        },
      },
    },
  });
  assert.throws(
    () => createSession(definition),
    (error) =>
      error.message === 'Field "city" states: formula failed: Formula values are readonly' &&
      error.cause instanceof TypeError,
  );
});
