import assert from "node:assert/strict";
import { test } from "node:test";
import { lotParams, option } from "./helpers/rows-async.mjs";
import { together } from "./helpers/rows-queries.mjs";
import {
  byProduct,
  defineForm,
  defineRules,
  handlesOf,
  observer,
  rules,
  sale,
  saved,
  sets,
  setup,
} from "./helpers/rule-sets.mjs";

// The queries of rule sets: they start, answer, fail and retry as those of
// rules do, in the order of the sequence within the header and within each
// collection, and their diagnostics name the place of their set.

const rate = {
  rate: { query: { endpoint: "rate", params: ({ priceList }) => ({ list: priceList }) } },
};
const each = (section) => section.lines.each;
// The order of the guide, inline and with its sets, and the rate of the header.
const inline = defineForm({
  ...sale,
  rules: {
    lines: { each: { ...each(rules.lots), ...each(rules.pricing), ...each(rules.amounts) } },
    ...rules.totals,
    ...rate,
  },
});
const composed = defineForm({
  ...sale,
  include: [sets.lots, sets.pricing, sets.amounts, sets.totals],
  rules: rate,
});

// Runs the same steps on both forms, each with its loader, and compares what
// they publish and what they asked after each one. A step receives the
// session and the requests of its side.
const asked = ({ calls }) => calls.map(({ key, signal }) => [key, signal.aborted]);
const lockstep = (lines, steps) => {
  const sides = [inline, composed].map((definition) => {
    const { open, calls } = setup(definition);
    return { session: open(lines), calls, seen: observer() };
  });
  const compare = (at) => {
    const [a, b] = sides;
    assert.deepEqual(b.seen(b.session), a.seen(a.session), `Step ${at}`);
    assert.deepEqual(asked(b), asked(a), `Step ${at}`);
  };
  compare("opening");
  return steps
    .reduce(
      (previous, step, at) =>
        previous
          .then(() => step(sides[0].session, sides[0].calls))
          .then(() => step(sides[1].session, sides[1].calls))
          .then(() => compare(at)),
      Promise.resolve(),
    )
    .then(() => sides[1]);
};

test("A rule set's header and row queries respond, fail, and retry just like inline queries", async () => {
  const lost = new Error("No network");
  const { calls } = await lockstep(
    [saved(1), { ...saved(2, "south"), quantity: 3 }],
    [
      (_, requests) => requests[0].resolve(),
      (_, requests) => requests[1].resolve(),
      (_, requests) => requests[2].reject(lost),
      (session) => handlesOf(session)[1].retry("price"),
      (_, requests) => requests[3].resolve(),
      (session) => session.edit("priceList", "wholesale"),
      (session) => handlesOf(session)[0].edit("product", option(3)),
      (_, requests) => together(...requests.slice(4).filter(({ signal }) => !signal.aborted)),
      (session) => session.remove("lines", [session.getSnapshot().rows.lines[0]]),
      (session) => session.reset(),
      (_, requests) => requests.at(-1).resolve(),
    ],
  );
  assert.ok(calls.length > 6);
});

test("A stale response does not write, and opening with initial skips queries for supplied values", async () => {
  await lockstep(
    [{ ...saved(1), price: 50 }, saved(2)],
    [
      (session) => handlesOf(session)[1].edit("product", option(4)),
      (_, requests) => requests.find(({ key }) => key[3].product === 2)?.resolve(),
      (_, requests) => requests.at(-1).resolve(),
      (session) => session.add("lines", [saved(3)], { at: 0 }),
      (session) => session.move("lines", session.getSnapshot().rows.lines[0], 2),
      (_, requests) => together(requests[0], requests.at(-1)),
    ],
  );
});

test("A query's index is its position in the sequence for its header or collection", () => {
  const discount = { lines: { each: { discount: { query: { endpoint: "rate" } } } } };
  const first = defineRules({
    ...sale,
    rules: { rate: { query: { endpoint: "rate" } }, ...discount },
  });
  const second = defineRules({
    ...sale,
    rules: { lines: { each: { price: { query: { endpoint: "rate", params: byProduct } } } } },
  });
  const definition = defineForm({
    ...sale,
    include: [second, first],
    rules: { total: { query: { endpoint: "rate" } } },
  });
  const { open, calls } = setup(definition);
  open([saved(1)]);
  // The header first, in the order of the sequence: rate of include[1], then
  // total of rules; then the line, with price of include[0] before discount.
  assert.deepEqual(
    calls.map(({ key }) => [key[2], key[3]]),
    [
      ["rate", {}],
      ["rate", {}],
      ["rate", { product: 1, list: "retail" }],
      ["rate", {}],
    ],
  );
  const session = open([saved(1)]);
  assert.deepEqual(Object.keys(session.getSnapshot().queries), ["rate", "total"]);
  assert.deepEqual(Object.keys(handlesOf(session)[0].getSnapshot().queries), ["price", "discount"]);
});

test("A row query from an earlier rule set starts after a header query declared later", () => {
  const rows = defineRules({
    ...sale,
    rules: { lines: { each: { price: { query: { endpoint: "linePrice", params: byProduct } } } } },
  });
  const header = defineRules({ ...sale, rules: rate });
  const { open, calls } = setup(defineForm({ ...sale, include: [rows, header] }));
  open([saved(2)]);
  assert.deepEqual(
    calls.map(({ key }) => key[2]),
    ["rate", "linePrice"],
  );
});

test("Diagnostics for params, the request, and the patch of a rule set query name its location", async () => {
  const lost = new Error("No network");
  const boom = new Error("No patch");
  const failing = defineRules({
    ...sale,
    rules: {
      rate: {
        query: {
          endpoint: "rate",
          patch: () => {
            throw boom;
          },
        },
      },
      lines: {
        each: {
          price: {
            query: {
              endpoint: "linePrice",
              params: ({ warehouse }, tools) => {
                if (warehouse === "x") throw new Error("No params");
                return byProduct({ product: option(1) }, tools);
              },
            },
          },
        },
      },
    },
  });
  const { open, calls } = setup(defineForm({ ...sale, include: [sets.lots, failing] }));
  const session = open([saved(1)]);
  const [line] = handlesOf(session);
  await calls[0].resolve();
  assert.equal(
    session.getSnapshot().queries.rate.error.message,
    'Field "rate" query (include[1]): patch failed: No patch',
  );
  await calls[1].reject(lost);
  assert.equal(
    line.getSnapshot().queries.price.error.message,
    `Field "price" of "lines" row "${line.key}" query (include[1]): request failed: No network`,
  );
  assert.throws(() => line.edit("warehouse", "x"), {
    message: `Field "price" of "lines" row "${line.key}" query.params (include[1]): formula failed: No params`,
  });
});

test("A form has the queries from its rule sets and rules, and another form does not have them", () => {
  const quote = defineForm({ ...sale, include: [sets.lots, sets.amounts] });
  const { open } = setup(quote);
  const session = open([saved(1)]);
  assert.deepEqual(session.getSnapshot().queries, {});
  assert.deepEqual(handlesOf(session)[0].getSnapshot().queries, {});
  const { open: openComposed } = setup(composed);
  assert.deepEqual(Object.keys(handlesOf(openComposed([saved(1)]))[0].getSnapshot().queries), [
    "price",
  ]);
});

test("One rule set can provide a field's params and another can provide its query with a patch", async () => {
  const patched = defineRules({
    ...sale,
    rules: {
      lines: {
        each: {
          lot: {
            query: {
              endpoint: "lots",
              params: lotParams,
              patch: ([first]) => ({ quantity: first ? 2 : 0 }),
            },
          },
        },
      },
    },
  });
  const { open, calls } = setup(defineForm({ ...sale, include: [sets.lots, patched] }));
  const session = open([saved(1)]);
  await calls[0].resolve();
  assert.equal(handlesOf(session)[0].getSnapshot().values.quantity, 2);
});
