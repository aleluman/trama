import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, defineRules, field } from "trama-forms/core";

test("the handle and nested patch apply mutual exclusion without changing another row", () => {
  const collections = { lines: { fields: { debit: field.number(), credit: field.number() } } };
  const rules = defineRules({
    collections,
    rules: {
      lines: {
        each: {
          debit: { onEdit: () => ({ credit: 0 }) },
          credit: { onEdit: () => ({ debit: 0 }) },
        },
      },
    },
  });
  const session = createSession(defineForm({ fields: {}, collections, include: [rules] }), {
    initial: {
      lines: [
        { debit: 0, credit: 20 },
        { debit: 10, credit: 30 },
      ],
    },
  });
  const [first, second] = session.getSnapshot().rows.lines;
  const line = session.row("lines", first);
  const other = session.row("lines", second);
  const unchanged = other.getSnapshot();
  const seen = [];
  session.subscribe(() => seen.push(line.getSnapshot().values));
  line.edit("debit", 50);
  line.edit("credit", 20);
  session.patch({ lines: { [first]: { debit: 50, credit: 20 } } });
  assert.deepEqual(seen, [
    { debit: 50, credit: 0 },
    { debit: 0, credit: 20 },
    { debit: 50, credit: 20 },
  ]);
  assert.equal(other.getSnapshot(), unchanged);
});

test("a header onEdit reaches another row and reveals an earlier target", () => {
  const session = createSession(
    defineForm({
      fields: { rate: field.number() },
      collections: { lines: { fields: { amount: field.number(), rate: field.number() } } },
      rules: {
        rate: { onEdit: ({ rate }, { rows }) => ({ lines: { [rows.lines[1]]: { rate } } }) },
        lines: { each: { rate: { onChange: ({ rate }) => ({ amount: rate * 10 }) } } },
      },
    }),
    {
      initial: {
        lines: [
          { amount: 8, rate: 1 },
          { amount: 9, rate: 2 },
        ],
      },
    },
  );
  const seen = [];
  session.subscribe(() => seen.push(session.getSnapshot().values.lines));
  session.edit("rate", 3);
  assert.deepEqual(seen, [
    [
      { amount: 8, rate: 1 },
      { amount: 30, rate: 3 },
    ],
  ]);
});

test("adding a row with a debit value does not trigger its onEdit", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: {
        lines: { fields: { debit: field.number(), credit: field.number({ default: 20 }) } },
      },
      rules: { lines: { each: { debit: { onEdit: () => ({ credit: 0 }) } } } },
    }),
  );
  const [key] = session.add("lines", [{ debit: 50 }]);
  assert.deepEqual(session.row("lines", key).getSnapshot().values, { debit: 50, credit: 20 });
});

test("changing targets between attempts preserves before and withdraws the earlier write", () => {
  let earlier;
  const form = defineForm({
    fields: {},
    collections: {
      lines: {
        fields: {
          choice: field.checkbox(),
          first: field.text(),
          second: field.text(),
          product: field.text(),
          relocate: field.checkbox(),
        },
      },
    },
    rules: {
      lines: {
        each: {
          product: {
            onEdit: ({ choice, product }, { before }) => {
              earlier ??= before;
              assert.equal(before, earlier);
              return choice
                ? { second: `${before.row.second}:${product}` }
                : { first: `${before.row.first}:${product}` };
            },
          },
          relocate: { onEdit: () => ({ choice: true }) },
        },
      },
    },
  });
  const session = createSession(form, { initial: { lines: [{ first: "A", second: "B" }] } });
  const [key] = session.getSnapshot().rows.lines;
  session.patch({ lines: { [key]: { product: "P", relocate: true } } });
  assert.deepEqual(session.row("lines", key).getSnapshot().values, {
    choice: true,
    first: "A",
    second: "B:P",
    product: "P",
    relocate: true,
  });
});

test("the product fills only an empty previous description in its row", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: { lines: { fields: { product: field.text(), description: field.text() } } },
      rules: {
        lines: {
          each: {
            product: {
              onEdit: ({ product }, { before }) =>
                before.row.description === "" ? { description: `Desc. ${product}` } : undefined,
            },
          },
        },
      },
    }),
    { initial: { lines: [{}, { description: "Written" }] } },
  );
  const [first, second] = session.getSnapshot().rows.lines;
  session.row("lines", first).edit("product", "A");
  session.row("lines", second).edit("product", "B");
  assert.deepEqual(session.getSnapshot().values.lines, [
    { product: "A", description: "Desc. A" },
    { product: "B", description: "Written" },
  ]);
});
test("row onEdit reads and property descriptors see the direct edit rather than the formula's value", () => {
  const session = createSession(
    defineForm({
      fields: {},
      collections: {
        lines: {
          fields: { source: field.number(), amount: field.number(), log: field.text() },
        },
      },
      rules: {
        lines: {
          each: {
            amount: {
              value: ({ source }) => source,
              onEdit: (row) => ({
                log: `${row.amount}:${Object.getOwnPropertyDescriptor(row, "amount").value}`,
              }),
            },
          },
        },
      },
    }),
    { initial: { lines: [{}] } },
  );
  const [key] = session.getSnapshot().rows.lines;
  session.patch({ lines: { [key]: { amount: 5, source: 7 } } });
  assert.deepEqual(session.row("lines", key).getSnapshot().values, {
    source: 7,
    amount: 7,
    log: "5:5",
  });
});
