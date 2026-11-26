import assert from "node:assert/strict";
import { test } from "node:test";
import { saved } from "./helpers/rows-async.mjs";
import { settle } from "./helpers/scripted-loader.mjs";
import {
  field,
  handlesOf,
  heard,
  lotPatched,
  pricedOrder,
  pricesOf,
  relabeled,
  setup,
  statusOf,
  together,
} from "./helpers/rows-queries.mjs";

// Responses that arrive before the close scheduled by the first one apply in
// one operation and publish once. The scripted loader is a mock. together()
// delivers several outcomes to the session in one task.

test("Responses that arrive before the close scheduled by the first one publish once with an updated snapshot for each row handle", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2), saved(3)]);
  const lines = handlesOf(session);
  const seen = heard(session, () => lines.map((line) => line.getSnapshot()));
  await together(...[1, 2, 3].map((product) => prices(product)[0]));
  assert.equal(seen.length, 1);
  assert.deepEqual(
    seen[0],
    lines.map((line) => line.getSnapshot()),
  );
  assert.deepEqual(pricesOf(lines), [
    [100, "idle"],
    [200, "idle"],
    [300, "idle"],
  ]);
});

test("A response that arrives in a microtask after the close forms another batch even if it is in the same task", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2)]);
  const [first, second] = await Promise.all([prices(1)[0].ready(), prices(2)[0].ready()]);
  let later = false;
  setImmediate(() => {
    later = true;
  });
  // The second answer arrives while the first batch is heard, after its close.
  const seen = heard(session, () => later);
  session.subscribe(second);
  first();
  await settle();
  assert.deepEqual(seen, [false, false]);
  assert.deepEqual(pricesOf(handlesOf(session)), [
    [100, "idle"],
    [200, "idle"],
  ]);
});

test("A batch with a success, an error, and a discard shows all three outcomes in its single notification", async () => {
  // The query of the note writes the total, which an edit changes while it asks.
  const definition = pricedOrder({
    rules: {
      note: {
        query: {
          endpoint: "unitPrice",
          params: ({ priceList }) => ({ list: priceList }),
          patch: (price) => ({ total: price }),
        },
      },
    },
  });
  const { open, prices, asked } = setup(definition);
  const session = open([saved(1), saved(2)]);
  const lines = handlesOf(session);
  session.edit("total", 5);
  const seen = heard(session, () => {
    const { values, queries } = session.getSnapshot();
    return [values.total, queries.note.status, ...pricesOf(lines)];
  });
  await together(
    prices(1)[0],
    prices(2)[0].refusal(new Error("No network")),
    asked("unitPrice")[0],
  );
  assert.deepEqual(seen, [[5, "idle", [100, "idle"], [null, "error"]]]);
  assert.equal(
    lines[1].getSnapshot().queries.price.error.message,
    `Field "price" of "lines" row "${lines[1].key}" query: request failed: No network`,
  );
});

test("If a success changes the failed query's params, the new generation wins and the old error does not replace it", async () => {
  const { open, prices, asked } = setup(relabeled());
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  const seen = heard(session, () => [line.getSnapshot().values.product.value, statusOf(line)]);
  await together(asked("lots")[0], prices(1)[0].refusal(new Error("No network")));
  assert.deepEqual(seen, [[3, "pending"]]);
  assert.equal(prices(3).length, 1);
});

test("A header response and row responses in the same batch apply together in one operation", async () => {
  const { open, prices, asked } = setup(
    pricedOrder({ rules: { total: { query: { endpoint: "unitPrice" } } } }),
  );
  const session = open([saved(1), saved(2)]);
  const lines = handlesOf(session);
  const seen = heard(session, () => [session.getSnapshot().values.total, ...pricesOf(lines)]);
  await together(asked("unitPrice")[0], prices(1)[0], prices(2)[0]);
  assert.deepEqual(seen, [[10, [100, "idle"], [200, "idle"]]]);
});

// A session whose lot query runs act in its patch, between the arrival of the
// price of the line and the close of their batch; each goes over its rules.
const between = async (act, each = {}) => {
  let acting;
  const patch = () => {
    acting?.();
  };
  const { open, prices, asked } = setup(lotPatched(patch, each));
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  const seen = heard(session, () => line.getSnapshot()?.values.price);
  acting = () => act(session, line);
  await together(prices(1)[0], asked("lots")[0]);
  return { line, seen };
};

// The price of a line that also writes its quantity.
const withQuantity = {
  price: {
    query: {
      endpoint: "linePrice",
      params: ({ product }, { values }) => ({ product: product.value, list: values.priceList }),
      patch: (price) => ({ price, quantity: 3 }),
    },
  },
};

test("An edit, retry, or reset between arrival and close discards that response", async () => {
  const edited = await between((_, line) => line.edit("price", 7));
  assert.deepEqual([...pricesOf([edited.line]), edited.seen.includes(100)], [[7, "idle"], false]);
  const retried = await between((_, line) => line.retry("price"));
  assert.deepEqual(
    [...pricesOf([retried.line]), retried.seen.includes(100)],
    [[null, "pending"], false],
  );
  const reset = await between((session) => session.reset());
  assert.deepEqual(
    [...pricesOf([reset.line]), reset.seen.includes(100)],
    [[null, "pending"], false],
  );
  // Another destination of the answer, edited in between, discards it whole.
  const revised = await between((_, line) => line.edit("quantity", 7), withQuantity);
  assert.deepEqual(
    [
      ...pricesOf([revised.line]),
      revised.line.getSnapshot().values.quantity,
      revised.seen.includes(100),
    ],
    [[null, "idle"], 7, false],
  );
});

test("A batch with no accepted patches publishes the state of its queries once", async () => {
  const { open, prices } = setup();
  const session = open([saved(1), saved(2), saved(3)]);
  const lines = handlesOf(session);
  const seen = heard(session, () => lines.map((line) => statusOf(line)));
  await together(
    ...[1, 2, 3].map((product) => prices(product)[0].refusal(new Error("No network"))),
  );
  assert.deepEqual(seen, [["error", "error", "error"]]);
});

test("An event triggered by several responses in the batch is applied once and resetVersion stays the same", async () => {
  // The total sums the prices, and its event copies it to the note.
  const definition = pricedOrder({
    rules: {
      total: {
        value: ({ lines }) => lines.reduce((sum, line) => sum + (line.price ?? 0), 0),
        onChange: ({ total }) => ({ note: String(total) }),
      },
    },
  });
  const { open, prices } = setup(definition);
  const session = open([saved(1), saved(2), saved(3)]);
  const { resetVersion } = session.getSnapshot();
  const seen = heard(session, () => {
    const after = session.getSnapshot();
    return [after.values.total, after.values.note, after.resetVersion];
  });
  await together(...[1, 2, 3].map((product) => prices(product)[0]));
  assert.deepEqual(seen, [[600, "600", resetVersion]]);
});

// The query of a writes b; rules add the one that depends on it.
const chained = (rules) =>
  pricedOrder({
    fields: { a: field.number(), b: field.number(), c: field.number() },
    rules: {
      a: {
        query: { endpoint: "unitPrice", params: () => ({ of: "a" }), patch: () => ({ b: 10 }) },
      },
      ...rules,
    },
  });
const askedFor = (calls, of) => calls.find(({ key }) => key[3].of === of);

test("A write from one response does not invalidate another in the same batch because each is checked against the state before the batch", async () => {
  // a writes b, the field of the query of b: b keeps its request and its answer writes.
  const entry = setup(
    chained({
      b: {
        query: { endpoint: "unitPrice", params: () => ({ of: "b" }), patch: () => ({ c: 20 }) },
      },
    }),
  );
  const session = entry.open();
  const ofB = askedFor(entry.calls, "b");
  const seen = heard(session, () => session.getSnapshot().values);
  await together(askedFor(entry.calls, "a"), ofB);
  assert.deepEqual(
    [
      seen.length,
      session.getSnapshot().values.b,
      session.getSnapshot().values.c,
      ofB.signal.aborted,
    ],
    [1, 10, 20, false],
  );
  // a writes b, which the params of c read: the answer of c to the old params
  // writes, and c asks again with the new ones.
  const params = setup(
    chained({
      c: {
        query: {
          endpoint: "unitPrice",
          params: ({ b }) => ({ of: "c", b }),
          patch: () => ({ c: 20 }),
        },
      },
    }),
  );
  const other = params.open();
  await together(askedFor(params.calls, "a"), askedFor(params.calls, "c"));
  const { values, queries } = other.getSnapshot();
  assert.deepEqual(
    [values.c, queries.c.status, params.calls.at(-1).key[3]],
    [20, "pending", { of: "c", b: 10 }],
  );
});
