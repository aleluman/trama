import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm as coreForm, field as coreField } from "trama-forms/core";
import { removedRow, saved, scope } from "./helpers/rows-async.mjs";
import {
  defineForm,
  field,
  handlesOf,
  pricedOrder,
  setup,
  statusOf,
} from "./helpers/rows-queries.mjs";
import { outputFailure } from "./helpers/session.mjs";

// The messages of the queries in rows: their definition, the scope, retry and
// the failures of a response, which go to the state of their row and write
// nothing.

// A form whose lines declare the query given on their price.
const queried = (query) => () =>
  defineForm({
    fields: {},
    collections: { lines: { fields: { product: field.async("products"), price: field.number() } } },
    rules: { lines: { each: { price: { query } } } },
  });

test("The bound defineForm checks a row query in order with its template label", () => {
  const label = 'Field "price" of "lines" query';
  const cases = [
    [5, `${label}: expected an object with endpoint, params, patch and optional forPrepare`],
    [{ endpoint: "linePrice", parms: () => ({}) }, `${label}: unknown property "parms"`],
    [{ endpoint: "x" }, `${label}: unknown endpoint "x"`],
    [
      { endpoint: "products" },
      `${label}: endpoint "products" is paged; use a value or list endpoint`,
    ],
    [{ endpoint: "linePrice", params: {} }, `${label}: params must be a function`],
    [{ endpoint: "linePrice", patch: 1 }, `${label}: patch must be a function`],
    [{ endpoint: "linePrice", forPrepare: 0 }, `${label}: forPrepare must be a boolean`],
  ];
  for (const [query, message] of cases) assert.throws(queried(query), { message });
  // query: undefined is omitting it, and a list endpoint is a query too.
  assert.doesNotThrow(queried());
  assert.doesNotThrow(queried({ endpoint: "lots", patch: () => ({}) }));
  assert.doesNotThrow(queried({ endpoint: "linePrice", forPrepare: true }));
});

test("The defineForm from trama-forms/core rejects a row query without checking its shape", () => {
  for (const query of [{ endpoint: "linePrice" }, 5, () => ({})])
    assert.throws(
      () =>
        coreForm({
          fields: {},
          collections: { lines: { fields: { price: coreField.number() } } },
          rules: { lines: { each: { price: { query } } } },
        }),
      {
        message:
          'Field "price" of "lines" query: define the form with the defineForm of createForms',
      },
    );
});

test("A session with row queries and no async fields requires a scope", () => {
  const definition = defineForm({
    fields: {},
    collections: { lines: { fields: { code: field.text(), price: field.number() } } },
    rules: { lines: { each: { price: { query: { endpoint: "linePrice" } } } } },
  });
  assert.throws(() => createSession(definition), { message: "Form with queries requires a scope" });
  assert.doesNotThrow(() =>
    createSession(definition, { scope, loader: () => new Promise(() => {}) }),
  );
});

test("Row retry checks the guard, row, and entry in that order", () => {
  const { open } = setup();
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  for (const name of ["quantity", "x", 5])
    assert.throws(() => line.retry(name), {
      message: `Field ${typeof name === "string" ? `"${name}"` : name} of "lines" has no query`,
    });
  const thrown = [];
  const stop = session.subscribe(() => {
    try {
      line.retry("quantity");
    } catch (error) {
      thrown.push(error.message);
    }
  });
  session.edit("note", "Another");
  stop();
  assert.deepEqual(thrown, ["Cannot retry a session during its notification"]);
  session.remove("lines", [line.key]);
  assert.throws(() => line.retry("quantity"), {
    message: removedRow(line.key),
  });
});

// Settles the first request with settle, checks that nothing was written and
// gives the error of the price of the line.
const failure = async (definition, settle = (call) => call.resolve()) => {
  const { open, asked } = setup(definition);
  const session = open([saved(2)]);
  const [line] = handlesOf(session);
  const before = session.getSnapshot();
  await settle(asked()[0]);
  assert.equal(session.getSnapshot().values, before.values);
  assert.equal(statusOf(line), "error");
  const { error } = line.getSnapshot().queries.price;
  return { error, key: line.key, prefix: `Field "price" of "lines" row "${line.key}" query` };
};
// A price whose query has the patch given.
const patching = (patch) =>
  pricedOrder({
    each: {
      price: {
        query: {
          endpoint: "linePrice",
          params: ({ product }) => product && { product: product.value, list: "x" },
          patch,
        },
      },
    },
  });

test("A request or patch failure or a non-object patch puts the row query in error with its label", async () => {
  const lost = new Error("No network");
  const boom = new Error("No patch");
  const request = await failure(undefined, (call) => call.reject(lost));
  assert.equal(request.error.message, `${request.prefix}: request failed: No network`);
  assert.equal(request.error.cause, lost);
  const thrown = await failure(
    patching(() => {
      throw boom;
    }),
  );
  assert.equal(thrown.error.message, `${thrown.prefix}: patch failed: No patch`);
  assert.equal(thrown.error.cause, boom);
  const shaped = await failure(patching(() => 5));
  assert.equal(shaped.error.message, `${shaped.prefix}: expected a patch object, got 5`);
});

test("Row patch validation uses its own row fields and reports an unknown or header field or an incompatible value without wrapping", async () => {
  const cases = [
    [{ total: 1 }, 'unknown field "total" in patch'],
    [{ price: 1, lines: [] }, 'unknown field "lines" in patch'],
    [{ price: "expensive" }, 'incompatible value "expensive" for number field "price"'],
    [{ product: 5 }, 'incompatible value 5 for async field "product"'],
  ];
  const failures = await Promise.all(cases.map(([patched]) => failure(patching(() => patched))));
  assert.deepEqual(
    failures.map(({ error, prefix }) => error.message.slice(prefix.length + 2)),
    cases.map(([, detail]) => detail),
  );
  // Without patch, the result is the value of the entry.
  const stocked = pricedOrder({
    each: {
      price: {
        query: {
          endpoint: "stock",
          params: ({ product }) => product && { product: product.value, warehouse: "south" },
        },
      },
    },
  });
  const { open, asked } = setup(stocked);
  const [line] = handlesOf(open([saved(2)]));
  await asked("stock")[0].resolve();
  assert.equal(
    line.getSnapshot().queries.price.error.message,
    `Field "price" of "lines" row "${line.key}" query: incompatible value [object Object] for number field "price"`,
  );
});

// An amount and a total that fail with the price of the answer.
const failingAmount = ({ price }) => {
  if (price === 200) throw new Error("No amount");
  return price;
};
const failingTotal = ({ lines }) => {
  if (lines[0]?.price === 200) throw new Error("No total");
  return 0;
};

test("A formula failure in the response operation puts the row in error with response operation failed", async () => {
  const { error, prefix, key } = await failure(
    pricedOrder({ each: { amount: { value: failingAmount } } }),
  );
  const cause = `Field "amount" of "lines" row "${key}" value: formula failed: No amount`;
  assert.equal(error.message, `${prefix}: response operation failed: ${cause}`);
  assert.equal(error.cause.message, cause);
  const header = await failure(pricedOrder({ rules: { total: { value: failingTotal } } }));
  assert.equal(
    header.error.message,
    `${header.prefix}: response operation failed: Field "total" value: formula failed: No total`,
  );
});

// An output that fails with the price of the answer.
const unit = ({ lines }) => {
  if (lines[0]?.price === 200) throw new Error("No unit");
  return 0;
};

test("A derived output that fails with the response value stays isolated and leaves the row free of failure", async () => {
  const { open, asked } = setup(pricedOrder({ outputs: ({ output }) => ({ unit: output(unit) }) }));
  const session = open([saved(2)]);
  const [line] = handlesOf(session);
  await asked()[0].resolve();
  assert.deepEqual([line.getSnapshot().values.price, statusOf(line)], [200, "idle"]);
  assert.equal(
    outputFailure(session, "unit").message,
    'Output "unit": calculation failed: No unit',
  );
});

// Params that fail for the product 3.
const failing = ({ product }) => {
  if (product?.value === 3) throw new Error("No params");
  return product === null ? undefined : { product: product.value, list: "x" };
};

test("Row query params that fail or return something other than a plain object reject the operation with the row label", () => {
  const { open } = setup(
    pricedOrder({ each: { price: { query: { endpoint: "linePrice", params: failing } } } }),
  );
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  assert.throws(() => line.edit("product", { value: 3, label: "Nut", unit: "u" }), {
    message: `Field "price" of "lines" row "${line.key}" query.params: formula failed: No params`,
  });
  assert.throws(() => session.add("lines", [saved(3)]), {
    message: /^Field "price" of "lines" row "r\d+" query\.params: formula failed: No params$/u,
  });
  assert.throws(() => open([saved(3)]), {
    message: /^Field "price" of "lines" row "r\d+" query\.params: formula failed: No params$/u,
  });
  const shaped = setup(
    pricedOrder({ each: { price: { query: { endpoint: "linePrice", params: () => 5 } } } }),
  );
  assert.throws(() => shaped.open([saved(1)]), {
    message:
      /^Field "price" of "lines" row "r\d+" query\.params: incompatible result 5, expected a plain object or undefined$/u,
  });
});
