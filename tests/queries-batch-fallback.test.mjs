import assert from "node:assert/strict";
import { test } from "node:test";
import { saved } from "./helpers/rows-async.mjs";
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

// These cases cover two responses writing the same field, a failed batch
// applying responses one by one with their prepared patches, and options
// that application code mutates before the batch closes. The scripted loader
// is a mock. together() delivers several outcomes in one task.

// The amount of a line fails with a price of 200, which fails the operation
// that writes it.
const vetoed = {
  amount: {
    value: ({ quantity, price }) => {
      if (price === 200) throw new Error("Price vetoed");
      return (quantity ?? 0) * (price ?? 0);
    },
  },
};
const failed = (line) =>
  `Field "price" of "lines" row "${line.key}" query: response operation failed: Field "amount" of "lines" row "${line.key}" value: formula failed: Price vetoed`;

// Two queries of the header that write the total: the one of the note first,
// then the one of the price list.
const writers = (first, second) =>
  pricedOrder({
    rules: {
      note: {
        query: { endpoint: "unitPrice", params: () => ({ by: "note" }), patch: () => first },
      },
      priceList: {
        query: { endpoint: "unitPrice", params: () => ({ by: "list" }), patch: () => second },
      },
    },
  });
const byWriter = (calls, by) => calls.find(({ key }) => key[3].by === by);

test("If two responses in the batch write the same field, the second is discarded even if the first writes the current value", async () => {
  const { open, calls } = setup(writers({ total: 1 }, { total: 2 }));
  const session = open();
  await together(byWriter(calls, "note"), byWriter(calls, "list"));
  const { values, queries } = session.getSnapshot();
  assert.deepEqual(
    [values.total, queries.note.status, queries.priceList.status],
    [1, "idle", "idle"],
  );
  const same = setup(writers({ total: 5 }, { total: 2 }));
  const held = same.open([], { total: 5 });
  await together(byWriter(same.calls, "note"), byWriter(same.calls, "list"));
  assert.equal(held.getSnapshot().values.total, 5);
  // A patch that leaves the field undefined does not take it.
  const loose = setup(writers({ total: undefined, note: "a" }, { total: 2 }));
  const free = loose.open();
  await together(byWriter(loose.calls, "note"), byWriter(loose.calls, "list"));
  assert.deepEqual([free.getSnapshot().values.total, free.getSnapshot().values.note], [2, "a"]);
});

// Three queries of the header, which write what first, second and third say,
// and a formula that vetoes some values of the total and the flag.
const vetoing = ({ first, second, third, veto }) =>
  pricedOrder({
    fields: { flag: field.number(), checked: field.number() },
    rules: {
      note: {
        query: { endpoint: "unitPrice", params: () => ({ by: "note" }), patch: () => first },
      },
      priceList: {
        query: { endpoint: "unitPrice", params: () => ({ by: "list" }), patch: () => second },
      },
      flag: {
        query: { endpoint: "unitPrice", params: () => ({ by: "flag" }), patch: () => third },
      },
      checked: {
        value: ({ total, flag }) => {
          if (veto(total, flag)) throw new Error("Vetoed");
          return total;
        },
      },
    },
  });

test("Fallback reconsiders a response discarded only because another response claimed its field", async () => {
  // The first one, which took the total, is the one that fails the batch.
  const first = setup(
    vetoing({ first: { total: 1 }, second: { total: 2 }, veto: (total) => total === 1 }),
  );
  const failing = first.open();
  const seen = heard(failing, () => failing.getSnapshot().values.total);
  await together(byWriter(first.calls, "note"), byWriter(first.calls, "list"));
  const { queries } = failing.getSnapshot();
  assert.deepEqual(
    [seen, queries.note.status, queries.priceList.status],
    [[null, 2], "error", "idle"],
  );
  assert.equal(
    queries.note.error.message,
    'Field "note" query: response operation failed: Field "checked" value: formula failed: Vetoed',
  );
  // The first one writes the total it already had, and a third one fails the batch.
  const held = setup(
    vetoing({
      first: { total: 5 },
      second: { total: 2 },
      third: { flag: 3 },
      veto: (_, flag) => flag === 3,
    }),
  );
  const session = held.open([], { total: 5 });
  const heardTotal = heard(session, () => session.getSnapshot().values.total);
  await together(...["note", "list", "flag"].map((by) => byWriter(held.calls, by)));
  const after = session.getSnapshot().queries;
  assert.deepEqual(
    [heardTotal, after.note.status, after.priceList.status, after.flag.status],
    [[5, 2, 2], "idle", "idle", "error"],
  );
});

test("If one response causes the batch operation to fail, the other responses apply one at a time and only that response stays in error", async () => {
  const { open, prices } = setup(pricedOrder({ each: vetoed }));
  const session = open([saved(1), saved(2), saved(3)]);
  const lines = handlesOf(session);
  const seen = heard(session, () => lines.map((line) => statusOf(line)));
  await together(...[1, 2, 3].map((product) => prices(product)[0]));
  assert.deepEqual(pricesOf(lines), [
    [100, "idle"],
    [null, "error"],
    [300, "idle"],
  ]);
  assert.equal(lines[1].getSnapshot().queries.price.error.message, failed(lines[1]));
  // The fallback publishes once per response, in their order of arrival.
  assert.deepEqual(seen, [
    ["idle", "pending", "pending"],
    ["idle", "error", "pending"],
    ["idle", "error", "idle"],
  ]);
});

// Lines whose lot query writes, in the first answer, an option of its own,
// and mutates it in the next one, before the close of their batch.
const mutating = (each) => {
  let kept;
  const patch = () => {
    if (kept === undefined) {
      kept = { value: "own", label: "Own lot", expires: "2027-01" };
      return { lot: kept };
    }
    kept.label = "Mutated";
    return {};
  };
  return lotPatched(patch, each);
};

test("Application code mutating an option between arrival and close does not change what the batch writes, including during fallback", async () => {
  const { open, asked } = setup(mutating());
  const [first] = handlesOf(open([saved(1), saved(3)]));
  await together(asked("lots")[0], asked("lots")[1]);
  assert.equal(first.getSnapshot().values.lot.label, "Own lot");
  const failing = setup(mutating(vetoed));
  const lines = handlesOf(failing.open([saved(1), saved(2)]));
  await together(failing.asked("lots")[0], failing.asked("lots")[1], failing.prices(2)[0]);
  assert.deepEqual(
    [lines[0].getSnapshot().values.lot.label, statusOf(lines[1])],
    ["Own lot", "error"],
  );
});

test("In fallback, a success that changes the failed query's params also opens a new generation that the error does not replace", async () => {
  const { open, prices, asked } = setup(relabeled(vetoed));
  const lines = handlesOf(open([saved(1), saved(2)]));
  await together(asked("lots")[0], prices(1)[0].refusal(new Error("No network")), prices(2)[0]);
  assert.deepEqual(
    [lines[0].getSnapshot().values.product.value, statusOf(lines[0]), prices(3).length],
    [3, "pending", 1],
  );
  assert.equal(lines[1].getSnapshot().queries.price.error.message, failed(lines[1]));
});
