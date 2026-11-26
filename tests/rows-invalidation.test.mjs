import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs, keysOf, rejects } from "./helpers/session.mjs";

// An operation reaches what it changes through the readers of each value: the
// rules it runs and the values it publishes are those of the whole traversal,
// whatever the number of rows.

// An order whose rules count their runs by kind.
const counted = () => {
  const runs = { amount: 0, total: 0, disabled: 0, output: 0 };
  const definition = defineForm({
    fields: { rate: field.number({ default: 1 }), total: field.number() },
    collections: {
      lines: {
        fields: {
          quantity: field.number({ default: 1 }),
          price: field.number({ default: 10 }),
          amount: field.number(),
          notes: field.text(),
        },
      },
    },
    rules: {
      total: {
        value: ({ lines }) => (runs.total++, lines.reduce((sum, l) => sum + (l.amount ?? 0), 0)),
      },
      lines: {
        each: {
          amount: {
            value: ({ quantity, price }, { values }) => (
              runs.amount++,
              quantity * price * values.rate
            ),
          },
          price: { disabled: ({ quantity }) => (runs.disabled++, quantity <= 0 && "No quantity") },
        },
      },
    },
    outputs: ({ output }) => ({ total: output(({ total }) => (runs.output++, total)) }),
  });
  return { definition, runs };
};
const ran = (runs, operation) => {
  for (const kind of Object.keys(runs)) runs[kind] = 0;
  operation();
  return { ...runs };
};

test("With 10 or 100 rows, an operation runs only the rules that read what changed", () => {
  const seen = [10, 100].map((count) => {
    const { definition, runs } = counted();
    const session = createSession(definition, {
      initial: { lines: Array.from({ length: count }, () => ({})) },
    });
    currentOutputs(session);
    const keys = keysOf(session);
    const row = session.row("lines", keys[3]);
    return {
      notes: ran(runs, () => row.edit("notes", "x")),
      quantity: ran(runs, () => row.edit("quantity", 0)),
      move: ran(runs, () => session.move("lines", keys[0], 1)),
      add: ran(runs, () => session.add("lines", [{}], { at: 0 })),
      remove: ran(runs, () => session.remove("lines", [keys[5]])),
      rate: ran(runs, () => session.edit("rate", 2)),
    };
  });
  const none = { amount: 0, total: 0, disabled: 0, output: 0 };
  assert.deepEqual(seen[0].notes, none);
  assert.deepEqual(seen[0].quantity, { amount: 1, total: 1, disabled: 1, output: 1 });
  assert.deepEqual(seen[0].move, { ...none, total: 1 });
  assert.deepEqual(seen[0].add, { amount: 1, total: 1, disabled: 1, output: 1 });
  assert.deepEqual(seen[0].remove, { amount: 0, total: 1, disabled: 0, output: 1 });
  for (const kind of ["notes", "quantity", "move", "add", "remove"])
    assert.deepEqual(seen[1][kind], seen[0][kind], kind);
  assert.deepEqual(seen[0].rate, { amount: 10, total: 1, disabled: 0, output: 1 });
  assert.deepEqual(seen[1].rate, { amount: 100, total: 1, disabled: 0, output: 1 });
});

test("A change propagates transitively to header and row readers", () => {
  const session = createSession(
    defineForm({
      fields: { subtotal: field.number(), tax: field.number() },
      collections: {
        lines: {
          fields: { quantity: field.number(), amount: field.number(), share: field.number() },
        },
      },
      rules: {
        subtotal: { value: ({ lines }) => lines.reduce((sum, l) => sum + (l.amount ?? 0), 0) },
        tax: { value: ({ subtotal }) => subtotal / 10 },
        lines: {
          each: {
            amount: { value: ({ quantity }) => (quantity ?? 0) * 10 },
            share: { value: ({ amount }, { values }) => (amount * 100) / (values.subtotal || 1) },
          },
        },
      },
    }),
    { initial: { lines: [{ quantity: 1 }, { quantity: 1 }, { quantity: 2 }] } },
  );
  session.row("lines", keysOf(session)[0]).edit("quantity", 5);
  const { values } = session.getSnapshot();
  assert.deepEqual(
    [values.subtotal, values.tax, values.lines.map((line) => line.share)],
    [80, 8, [62.5, 12.5, 25]],
  );
});

test("Readers of a destination revealed by an event are recalculated in the header and the rows", () => {
  const session = createSession(
    defineForm({
      fields: { depot: field.text(), summary: field.text() },
      collections: { lines: { fields: { warehouse: field.text(), label: field.text() } } },
      rules: {
        depot: {
          onChange: ({ depot }, { rows }) => ({
            lines: Object.fromEntries(rows.lines.map((key) => [key, { warehouse: depot }])),
          }),
        },
        summary: { value: ({ lines }) => lines.map((line) => line.warehouse).join(",") },
        lines: { each: { label: { value: ({ warehouse }) => `in ${warehouse}` } } },
      },
    }),
    { initial: { lines: [{ warehouse: "a" }, { warehouse: "b" }] } },
  );
  session.edit("depot", "north");
  const { values } = session.getSnapshot();
  assert.deepEqual(
    [values.summary, values.lines.map((line) => line.label)],
    ["north,north", ["in north", "in north"]],
  );
});

// The amount of a line fails when its price is negative.
const failing = () =>
  defineForm({
    fields: { rate: field.number({ default: 1 }) },
    collections: { lines: { fields: { price: field.number(), amount: field.number() } } },
    rules: {
      lines: {
        each: {
          amount: {
            value: ({ price }, { values }) => {
              if (price < 0 || values.rate < 0) throw new Error(`price ${price}`);
              // A line with price 7 stops reading the rate, and reads it again after.
              return price === 7 ? price : price * values.rate;
            },
          },
        },
      },
    },
  });

test("The first failure follows creation order even if the patch names rows in reverse or a rule changes its reads", () => {
  const session = createSession(failing(), {
    initial: { lines: [{ price: 1 }, { price: 2 }, { price: 3 }] },
  });
  const [a, b, c] = keysOf(session);
  rejects(
    session,
    () => session.patch({ lines: { [c]: { price: -3 }, [b]: { price: -2 } } }),
    `Field "amount" of "lines" row "${b}" value: formula failed: price -2`,
  );
  // The first line reads the rate again after the others.
  session.row("lines", a).edit("price", 7);
  session.row("lines", a).edit("price", 1);
  rejects(
    session,
    () => session.edit("rate", -1),
    `Field "amount" of "lines" row "${a}" value: formula failed: price 1`,
  );
});

// An event that reads a field derived from its destination, which it settles
// before writing it, closes a cycle as in the whole traversal, even when that
// field did not change: the traversal settled it before the event.
test("In the header, an event that reads a field derived from its destination is rejected with a cycle even if that field has not changed", () => {
  const session = createSession(
    defineForm({
      fields: { a: field.number(), b: field.number({ default: 1 }), c: field.number() },
      rules: {
        a: { onChange: (values) => ({ b: (values.c ?? 0) + 10 }) },
        c: { value: ({ b }) => b * 2 },
      },
    }),
  );
  rejects(
    session,
    () => session.edit("a", 1),
    'Field "a" onChange: cyclic dependency a.onChange → c → b → a.onChange',
  );
});

// Lines whose double derives from base, which the event of qty writes from a
// read of the double, of its own row or through the total of the header.
const doubled = (rules) =>
  createSession(
    defineForm({
      fields: { total: field.number() },
      collections: {
        lines: {
          fields: {
            qty: field.number(),
            base: field.number({ default: 1 }),
            double: field.number(),
          },
        },
      },
      rules: {
        ...rules,
        lines: { each: { ...rules.lines, double: { value: ({ base }) => base * 2 } } },
      },
    }),
    { initial: { lines: [{}, {}] } },
  );
const cycleOf = (key, through = []) =>
  `Field "qty" of "lines" row "${key}" onChange: cyclic dependency ${[
    `lines["${key}"].qty.onChange`,
    ...through,
    `lines["${key}"].double`,
    `lines["${key}"].base`,
    `lines["${key}"].qty.onChange`,
  ].join(" → ")}`;

test("In a row, an event that reads a field derived from its destination is rejected with a cycle, including through the header", () => {
  const own = doubled({ lines: { qty: { onChange: (row) => ({ base: (row.double ?? 0) + 1 }) } } });
  const [, second] = keysOf(own);
  rejects(own, () => own.row("lines", second).edit("qty", 3), cycleOf(second));
  const through = doubled({
    total: { value: ({ lines }) => lines.reduce((sum, line) => sum + (line.double ?? 0), 0) },
    lines: { qty: { onChange: (_, { values }) => ({ base: values.total + 1 }) } },
  });
  const [, last] = keysOf(through);
  rejects(through, () => through.row("lines", last).edit("qty", 3), cycleOf(last, ["total"]));
});

test("A rejected operation discards the reads it recorded, so the next operation follows the previous reads", () => {
  const session = createSession(
    defineForm({
      fields: {
        flag: field.checkbox(),
        a: field.number({ default: 1 }),
        b: field.number({ default: 2 }),
        total: field.number(),
        note: field.text(),
      },
      collections: { lines: { fields: { price: field.number(), seen: field.number() } } },
      rules: {
        // Each branch reads only its own field.
        total: { value: (values) => (values.flag ? values.b : values.a) },
        // A rejected flag takes the reads of total and seen with it.
        note: {
          disabled: ({ flag }) => {
            if (flag) throw new Error("flag");
            return false;
          },
        },
        lines: { each: { seen: { value: ({ price }, { values }) => (values.flag ? 0 : price) } } },
      },
    }),
    { initial: { lines: [{ price: 4 }] } },
  );
  // An operation that changes what total read commits first, so that the
  // memory is the session's own.
  session.edit("a", 3);
  rejects(session, () => session.edit("flag", true), 'Field "note" disabled: formula failed: flag');
  session.edit("a", 5);
  session.row("lines", keysOf(session)[0]).edit("price", 6);
  const { values } = session.getSnapshot();
  assert.deepEqual([values.total, values.lines[0].seen], [5, 6]);
});
