import assert from "node:assert/strict";
import { test } from "node:test";
import { createForms, createSession, defineEndpoints, endpoint } from "trama-forms/core";
import { scriptedLoader } from "./helpers/scripted-loader.mjs";
import { outputFailure } from "./helpers/session.mjs";

// The failures of an answer: the request, the patch, its validation and the
// operation that applies it. None writes a value and all leave the query in
// error. Sessions ask through the scripted loader, a mock: each request waits
// until the test settles it, and resolve() runs the endpoint's load.
const scope = "acme";
const byCustomer = ({ customer }) => (customer === null ? undefined : { customer });
const priced = (_, { customer }) => Promise.resolve(1000 + 100 * customer);

// A session that asks for the price of customer 1 on opening. load answers it;
// params and patch go to its query, entry to its rules entry and rules to the rest.
const setup = ({ load = priced, params = byCustomer, patch, entry, rules, outputs } = {}) => {
  const catalog = defineEndpoints({
    unitPrice: endpoint.value(load),
    contacts: endpoint.list(() => Promise.resolve([])),
  });
  const { defineForm, field } = createForms({ endpoints: [catalog] });
  const definition = defineForm({
    fields: {
      customer: field.number(),
      price: field.number({ default: 5000 }),
      total: field.number(),
      contact: field.async("contacts"),
      note: field.text(),
    },
    rules: { price: { query: { endpoint: "unitPrice", params, patch }, ...entry }, ...rules },
    outputs,
  });
  const { loader, calls } = scriptedLoader();
  const session = createSession(definition, { scope, loader, initial: { customer: 1 } });
  return { session, calls };
};

// A value that is not plain data.
const notPlain = () => Promise.resolve({ amount: 1, since: new Date(0) });

// Settles the request, running load unless settle says otherwise, checks that
// nothing was written and gives the error of the query.
const failure = async (config, settle = (call) => call.resolve()) => {
  const { session, calls } = setup(config);
  const before = session.getSnapshot();
  await settle(calls[0]);
  const { values, fieldStates, queries } = session.getSnapshot();
  assert.equal(values, before.values);
  assert.equal(fieldStates, before.fieldStates);
  assert.equal(queries.price.status, "error");
  return queries.price.error;
};

test("A load, transport, or run validation failure leaves the query in error with request failed and the original cause", async () => {
  const lost = new Error("No connection");
  const transport = new Error("Transport unavailable");
  const invalid = 'Endpoint "unitPrice": result must be plain data: a Date at "since"';
  const [loaded, carried, validated] = await Promise.all([
    failure({ load: () => Promise.reject(lost) }),
    failure({}, (call) => call.reject(transport)),
    failure({ load: notPlain }),
  ]);
  assert.equal(loaded.message, 'Field "price" query: request failed: No connection');
  assert.equal(loaded.cause, lost);
  assert.equal(carried.message, 'Field "price" query: request failed: Transport unavailable');
  assert.equal(carried.cause, transport);
  assert.equal(validated.message, `Field "price" query: request failed: ${invalid}`);
  assert.equal(validated.cause.message, invalid);
  // run validates the value itself, so a cache never holds it.
  const { calls } = setup({ load: notPlain });
  await assert.rejects(
    Promise.try(() => calls[0].run(calls[0].signal)),
    { message: invalid },
  );
});

test("A patch that throws or does not return an object leaves the query in error without writing", async () => {
  const boom = new Error("No patch");
  const shapes = [
    [5, "5"],
    [null, "null"],
    ["price", '"price"'],
    [[], "[object Array]"],
    [Promise.resolve({ price: 1 }), "[object Promise]"],
  ];
  const [thrown, ...shaped] = await Promise.all([
    failure({
      patch: () => {
        throw boom;
      },
    }),
    ...shapes.map(([result]) => failure({ patch: () => result })),
  ]);
  assert.equal(thrown.message, 'Field "price" query: patch failed: No patch');
  assert.equal(thrown.cause, boom);
  assert.deepEqual(
    shaped.map(({ message }) => message),
    shapes.map(([, shown]) => `Field "price" query: expected a patch object, got ${shown}`),
  );
});

test("The response patch is validated like an event patch. An unknown field or incompatible value leaves the query in error without writing", async () => {
  const dated = { value: 1, label: "Ana", since: new Date(0) };
  const cases = [
    [{ x: 1 }, 'unknown field "x" in patch'],
    // As in an event, an unknown field is an error even with undefined.
    [{ price: 1, x: undefined }, 'unknown field "x" in patch'],
    [{ price: 1, toString: 2 }, 'unknown field "toString" in patch'],
    [{ price: "expensive" }, 'incompatible value "expensive" for number field "price"'],
    [{ price: 1, note: null }, 'incompatible value null for text field "note"'],
    [{ contact: 5 }, 'incompatible value 5 for async field "contact"'],
    [
      { contact: dated },
      'incompatible value for async field "contact": option must be plain data: a Date at "since"',
    ],
  ];
  const errors = await Promise.all([
    ...cases.map(([patched]) => failure({ patch: () => patched })),
    // Without patch, the result is the value of the entry.
    failure({ load: () => Promise.resolve("expensive") }),
  ]);
  assert.deepEqual(
    errors.map(({ message }) => message),
    [...cases.map(([, detail]) => detail), cases[3][1]].map(
      (detail) => `Field "price" query: ${detail}`,
    ),
  );
});

// A total that fails with the price of the answer.
const failingTotal = ({ price }) => {
  if (price === 1100) throw new Error("No total");
  return price;
};
// An event of the price that fails with the price of the answer.
const failingEvent = ({ price }) => {
  if (price === 1100) throw new Error("No event");
};
// Params that read the price and fail with the price of the answer.
const failingParams = (values) => {
  if (values.price === 1100) throw new Error("No params");
  return byCustomer(values);
};

test("A formula, event, or params failure in the response operation leaves the query in error with response operation failed", async () => {
  const cases = [
    [
      { rules: { total: { value: failingTotal } } },
      'Field "total" value: formula failed: No total',
    ],
    [{ entry: { onChange: failingEvent } }, 'Field "price" onChange: event failed: No event'],
    [{ params: failingParams }, 'Field "price" query.params: formula failed: No params'],
  ];
  const errors = await Promise.all(cases.map(([config]) => failure(config)));
  for (const [index, [, cause]] of cases.entries()) {
    assert.equal(errors[index].message, `Field "price" query: response operation failed: ${cause}`);
    assert.equal(errors[index].cause.message, cause);
  }
});

// An output that fails with the price of the answer.
const unit = ({ price }) => {
  if (price === 1100) throw new Error("No unit");
  return price;
};

test("A derived output that fails with the response value remains isolated and does not fail the commit", async () => {
  const { session, calls } = setup({ outputs: ({ output }) => ({ unit: output(unit) }) });
  await calls[0].resolve();
  const { values, queries } = session.getSnapshot();
  assert.deepEqual([values.price, queries.price], [1100, { status: "idle", error: undefined }]);
  assert.equal(
    outputFailure(session, "unit").message,
    'Output "unit": calculation failed: No unit',
  );
});
