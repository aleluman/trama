import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "trama-forms/core";
import { defineForm, field, scope } from "./helpers/rows-async.mjs";
import { keysOf, rejects } from "./helpers/session.mjs";

// An option with nested metadata, as the author writes it.
const option = (value, label = `Product ${value}`) => ({
  value,
  label,
  unit: { name: "u" },
  tags: ["new"],
});
// In each line, product is written by a formula from pick and lot by an event
// from send, each with the item of that index. counts records the events of
// both async fields and the runs of a formula of state that reads them.
const counter = () => ({ changes: 0, reads: 0 });
const form = (items = [], counts = counter()) => {
  const changed = () => void counts.changes++;
  return defineForm({
    fields: { trigger: field.number() },
    collections: {
      lines: {
        fields: {
          product: field.async("products"),
          lot: field.async("lots"),
          pick: field.number(),
          send: field.number(),
          note: field.text(),
        },
      },
    },
    rules: {
      lines: {
        each: {
          product: {
            value: ({ pick }) => (pick === null ? undefined : items[pick]),
            onChange: changed,
          },
          lot: { onChange: changed },
          send: { onChange: ({ send }) => (send === null ? undefined : { lot: items[send] }) },
          note: {
            label: ({ product, lot }) => {
              counts.reads++;
              return `${product?.label} / ${lot?.label}`;
            },
          },
        },
      },
    },
  });
};
const open = (definition, lines, initial = {}) =>
  createSession(definition, { scope, initial: { ...initial, lines } });
const lineOf = (session, at = 0) => session.getSnapshot().values.lines[at];
const handleOf = (session, at = 0) => session.row("lines", keysOf(session)[at]);
// The option the session holds is a deep frozen copy of the author's object,
// which stays theirs.
const assertCopy = (held, authored) => {
  assert.notEqual(held, authored);
  assert.deepEqual(held, authored);
  for (const key of ["unit", "tags"]) assert.notEqual(held[key], authored[key]);
  for (const value of [held, held.unit, held.tags]) assert.ok(Object.isFrozen(value));
};

test("Reselecting the same value in a row keeps the current option at that address without running events or formulas", () => {
  const counts = counter();
  const items = [
    { value: 1, label: "Another name", extra: true },
    { value: 2, label: "Another lot", tags: [] },
  ];
  const session = open(form(items, counts), [
    { product: option(1, "Screw"), lot: option(2, "Lot A") },
  ]);
  const { product, lot } = lineOf(session);
  const line = handleOf(session);
  const opened = { ...counts };
  // Directly, through a patch of the session, a formula and an event.
  line.edit("product", { ...items[0] });
  session.patch({ lines: { [line.key]: { lot: { ...items[1] } } } });
  line.edit("pick", 0);
  line.edit("send", 1);
  assert.equal(lineOf(session).product, product);
  assert.equal(lineOf(session).lot, lot);
  assert.deepEqual(counts, opened);
  assert.equal(line.getSnapshot().fieldStates.note.label, "Screw / Lot A");
  // Another value, or the same value of another type, is a change.
  line.edit("product", { value: "1", label: "One" });
  session.patch({ lines: { [line.key]: { lot: option(3, "Lot C") } } });
  assert.equal(counts.changes, 2);
  assert.equal(line.getSnapshot().fieldStates.note.label, "One / Lot C");
});

test("Each write to a row stores a deeply frozen copy independent of the author's object", () => {
  const supplied = option(1);
  assertCopy(lineOf(open(form(), [{ product: supplied }])).product, supplied);
  const session = open(form(), []);
  const added = option(2);
  session.add("lines", [{ product: added }]);
  assertCopy(lineOf(session).product, added);
  const [edited, patched] = [option(3), option(4)];
  handleOf(session).edit("product", edited);
  assertCopy(lineOf(session).product, edited);
  session.patch({ lines: { [keysOf(session)[0]]: { lot: patched } } });
  assertCopy(lineOf(session).lot, patched);
  const [formula, event] = [option(5), option(6)];
  const written = open(form([formula, event]), [{}]);
  handleOf(written).edit("pick", 0);
  handleOf(written).edit("send", 1);
  assertCopy(lineOf(written).product, formula);
  assertCopy(lineOf(written).lot, event);
  // What Trama already copied is written as it is, also in another row.
  written.add("lines", [{}]);
  handleOf(written, 1).edit("product", lineOf(written).product);
  assert.equal(lineOf(written, 1).product, lineOf(written).product);
});

// Two rows run the same formula, which returns the same option once the
// trigger of the header is set. kept holds an option with that value since the
// opening, so it keeps it; the other held none, so it gets a copy of the option
// the formula returned.
const shared = () => {
  const returned = { value: 1, label: "New" };
  return defineForm({
    fields: { trigger: field.number({ default: 0 }) },
    collections: { lines: { fields: { product: field.async("products") } } },
    rules: {
      lines: {
        each: { product: { value: (_, { values }) => (values.trigger ? returned : undefined) } },
      },
    },
  });
};
const held = { value: 1, label: "Existing" };
const triggered = (definition, lines) => {
  const session = open(definition, lines);
  session.edit("trigger", 1);
  return session.getSnapshot().values.lines.map((line) => line.product);
};

test("An option returned by the formulas of two rows is copied per row, so each row keeps its own option", () => {
  for (const lines of [
    [{ product: held }, {}],
    [{}, { product: held }],
  ]) {
    const products = triggered(shared(), lines);
    assert.deepEqual(
      products,
      lines.map((line) => (line.product === undefined ? { value: 1, label: "New" } : held)),
    );
  }
});

// Each row adopts the option, a formula of its row reads it, and then an event
// of the row writes before, declared before them, so the candidate is redone
// after every row adopted: the reader runs again and must see the same object.
const redone = () => {
  const returned = { value: 1, label: "New" };
  const seen = new Map();
  const definition = defineForm({
    fields: { change: field.number({ default: 0 }) },
    collections: {
      lines: {
        fields: {
          before: field.number({ default: 0 }),
          product: field.async("products"),
          trigger: field.number({ default: 0 }),
        },
      },
    },
    rules: {
      lines: {
        each: {
          product: { value: (_, { values }) => (values.change ? returned : undefined) },
          trigger: {
            value: (row, { values, key }) => {
              if (values.change) seen.set(key, [...(seen.get(key) ?? []), row.product]);
              return values.change;
            },
            onChange: () => ({ before: 1 }),
          },
        },
      },
    },
  });
  return { definition, returned, seen };
};

test("Each row still keeps its own option when the candidate is recreated after both rows adopted their options", () => {
  const { definition, returned, seen } = redone();
  const session = open(definition, [{ product: held }, {}, { product: held }]);
  session.edit("change", 1);
  const products = session.getSnapshot().values.lines.map((line) => line.product);
  assert.deepEqual(products, [held, { value: 1, label: "New" }, held]);
  assert.notEqual(products[1], returned);
  assert.ok(Object.isFrozen(products[1]));
  // The reader ran again in every row, and saw the same object each time.
  assert.equal(seen.size, 3);
  for (const [key, objects] of seen) {
    assert.ok(objects.length > 1, `row ${key} ran once`);
    assert.ok(
      objects.every((object) => object === objects[0]),
      `row ${key} saw another object`,
    );
  }
  assert.deepEqual(
    [...seen.values()].map((objects) => objects[0].label),
    ["Existing", "New", "Existing"],
  );
});

test("A header event that writes to rows adopts options per row", () => {
  const definition = defineForm({
    fields: { trigger: field.number() },
    collections: { lines: { fields: { product: field.async("products") } } },
    rules: {
      trigger: {
        onChange: (_, { rows }) => ({
          lines: Object.fromEntries(
            rows.lines.map((key) => [key, { product: { ...held, label: "Another" } }]),
          ),
        }),
      },
    },
  });
  const session = open(definition, [{ product: held }, {}]);
  const [kept] = session.getSnapshot().values.lines;
  session.edit("trigger", 1);
  const [first, second] = session.getSnapshot().values.lines;
  assert.equal(first.product, kept.product);
  assert.deepEqual(second.product, { ...held, label: "Another" });
  assert.ok(Object.isFrozen(second.product));
});

test("Each row opens with its own frozen copy of an async field default and reset restores that copy", () => {
  const authored = option(9, "Generic");
  const definition = defineForm({
    fields: {},
    collections: {
      lines: {
        fields: {
          product: field.async("products", { default: authored }),
          clear: field.checkbox(),
        },
      },
    },
    rules: {
      lines: {
        each: { clear: { onChange: (_, { toDefaults }) => toDefaults("product") } },
      },
    },
  });
  const opened = definition.collections.lines.fields.product.default;
  assertCopy(opened, authored);
  const session = open(definition, [{}, { product: option(2) }]);
  assert.equal(lineOf(session).product, opened);
  handleOf(session, 1).edit("clear", true);
  assert.equal(lineOf(session, 1).product, opened);
  const [added] = session.add("lines", [{}]);
  assert.equal(session.row("lines", added).getSnapshot().values.product, opened);
  session.reset();
  assert.deepEqual(lineOf(session, 1).product, option(2));
});

test("An async row field accepts only complete options and identifies its row in the error message", () => {
  const session = open(form(), [{}]);
  const line = handleOf(session);
  for (const [value, problem] of [
    [5, "incompatible value 5"],
    [{ value: 1 }, "incompatible value [object Object]"],
  ])
    rejects(
      session,
      () => line.edit("product", value),
      `Field "product" of "lines" row "${line.key}" (async): ${problem}`,
    );
  assert.throws(() => session.add("lines", [{ product: { label: "x" } }]), {
    message:
      'Collection "lines" add[0]: incompatible value [object Object] for async field "product"',
  });
});
