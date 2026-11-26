import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };
const order = defineForm({
  fields: {
    customer: field.text({ label: "Customer" }),
    quantity: field.number({ label: "Quantity", default: 2 }),
    price: field.number({ label: "Unit price", default: 5000 }),
    total: field.number({ label: "Net total" }),
    country: field.select({
      label: "Delivery country",
      options: [
        { value: "ES", label: "Spain" },
        { value: "MX", label: "Mexico" },
        { value: "JP", label: "Japan" },
      ],
      default: "ES",
    }),
    city: field.text({ label: "City" }),
    useCapital: field.checkbox({ label: "Use the capital" }),
  },
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    city: {
      value: ({ useCapital, country }) =>
        useCapital && country !== null ? capitals[country] : undefined,
    },
  },
});

test("the order total is calculated at opening, can be edited manually, and recalculates when a read changes", () => {
  const session = createSession(order);
  const other = createSession(order);
  assert.equal(session.getSnapshot().values.total, 10000);
  session.edit("total", 25000);
  session.edit("customer", "Atlas Trading");
  assert.equal(session.getSnapshot().values.total, 25000);
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.total, 15000);
  session.edit("price", null);
  assert.equal(session.getSnapshot().values.total, 0);
  assert.equal(other.getSnapshot().values.total, 10000);
  session.reset();
  assert.equal(session.getSnapshot().values.total, 10000);
  assert.equal(session.getSnapshot().values.quantity, 2);
});

test("supplied totals of 9500, 0, and null take precedence at opening, and the formula records its reads", () => {
  for (const total of [9500, 0, null]) {
    const session = createSession(order, { initial: { total } });
    assert.equal(session.getSnapshot().values.total, total);
    session.edit("customer", "Atlas Trading");
    assert.equal(session.getSnapshot().values.total, total);
    session.edit("price", 6000);
    assert.equal(session.getSnapshot().values.total, 12000);
    session.reset();
    assert.equal(session.getSnapshot().values.total, total);
    session.edit("quantity", 1);
    assert.equal(session.getSnapshot().values.total, 5000);
  }
});

test("a value omitted from initial is calculated using the supplied values", () => {
  const session = createSession(order, { initial: { quantity: 4, price: 250 } });
  assert.equal(session.getSnapshot().values.total, 1000);
  session.edit("total", 900);
  session.reset();
  assert.equal(session.getSnapshot().values.total, 1000);
});

test("undefined does not write; false, 0, and the empty string are values", () => {
  const session = createSession(order, { initial: { city: "Seville" } });
  session.edit("country", "MX");
  assert.equal(session.getSnapshot().values.city, "Seville");
  session.edit("useCapital", true);
  assert.equal(session.getSnapshot().values.city, "Mexico City");
  session.edit("city", "Monterrey");
  session.edit("useCapital", false);
  assert.equal(session.getSnapshot().values.city, "Monterrey");

  const falsy = defineForm({
    fields: {
      source: field.number({ default: 1 }),
      text: field.text({ default: "Initial" }),
      count: field.number({ default: 7 }),
      flag: field.checkbox({ default: true }),
    },
    rules: {
      text: { value: ({ source }) => (source === 0 ? "" : undefined) },
      count: { value: ({ source }) => (source === 0 ? 0 : undefined) },
      flag: { value: ({ source }) => (source === 0 ? false : undefined) },
    },
  });
  const values = createSession(falsy);
  assert.deepEqual(values.getSnapshot().values, {
    source: 1,
    text: "Initial",
    count: 7,
    flag: true,
  });
  values.edit("source", 0);
  assert.deepEqual(values.getSnapshot().values, { source: 0, text: "", count: 0, flag: false });
});

test("chained formulas resolve independently of field and rule order", () => {
  const definition = defineForm({
    rules: {
      caption: { value: ({ total }) => `Total ${total}` },
      total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    },
    fields: {
      caption: field.text(),
      total: field.number(),
      price: field.number(),
      quantity: field.number(),
    },
  });
  const session = createSession(definition, { initial: { quantity: 2, price: 10 } });
  assert.deepEqual(session.getSnapshot().values, {
    caption: "Total 20",
    total: 20,
    price: 10,
    quantity: 2,
  });
  const observed = [];
  session.subscribe(() => observed.push(session.getSnapshot().values));
  session.edit("quantity", 3);
  assert.deepEqual(observed, [{ caption: "Total 30", total: 30, price: 10, quantity: 3 }]);
});

test("an equal result does not rerun its readers", () => {
  let captions = 0;
  const definition = defineForm({
    fields: {
      quantity: field.number({ default: 1 }),
      parity: field.number(),
      caption: field.text(),
    },
    rules: {
      parity: { value: ({ quantity }) => (quantity ?? 0) % 2 },
      caption: {
        value: ({ parity }) => {
          captions++;
          return `Parity ${parity}`;
        },
      },
    },
  });
  const session = createSession(definition);
  const opened = captions;
  session.edit("caption", "Manual");
  session.edit("quantity", 3);
  assert.equal(captions, opened);
  assert.equal(session.getSnapshot().values.caption, "Manual");
  session.edit("quantity", 4);
  assert.equal(session.getSnapshot().values.caption, "Parity 0");
});

test("an unchanged result does not rerun its readers, and supplied falsy values retain priority", () => {
  const definition = defineForm({
    fields: {
      quantity: field.number({ default: 1 }),
      parity: field.number(),
      caption: field.text(),
      flag: field.checkbox(),
    },
    rules: {
      parity: { value: ({ quantity }) => quantity % 2 },
      caption: { value: ({ parity }) => `Parity ${parity}` },
      flag: { value: ({ quantity }) => quantity > 0 },
    },
  });
  const session = createSession(definition, { initial: { caption: "", flag: false } });
  assert.equal(session.getSnapshot().values.caption, "");
  assert.equal(session.getSnapshot().values.flag, false);
  session.edit("quantity", 3);
  assert.equal(session.getSnapshot().values.caption, "");
  assert.equal(session.getSnapshot().values.flag, true);
  session.edit("quantity", 4);
  assert.equal(session.getSnapshot().values.caption, "Parity 0");
});

test("an edit with no difference and a reset do not run formulas; reset restores the initial branch", () => {
  let calls = 0;
  const definition = defineForm({
    fields: {
      alternate: field.checkbox(),
      a: field.number({ default: 2 }),
      b: field.number({ default: 10 }),
      total: field.number(),
    },
    rules: {
      total: {
        value: (values) => {
          calls++;
          return values.alternate ? values.b : values.a;
        },
      },
    },
  });
  const session = createSession(definition);
  session.edit("alternate", true);
  assert.equal(session.getSnapshot().values.total, 10);
  const evaluated = calls;
  session.edit("alternate", true);
  session.reset();
  assert.equal(calls, evaluated);
  assert.equal(session.getSnapshot().values.total, 2);
  session.edit("b", 11);
  assert.equal(session.getSnapshot().values.total, 2);
  session.edit("a", 3);
  assert.equal(session.getSnapshot().values.total, 3);
});

test("reset also restores tracking for the initial branch without running value formulas", () => {
  const definition = defineForm({
    fields: {
      alternate: field.checkbox(),
      a: field.number({ default: 2 }),
      b: field.number({ default: 10 }),
      total: field.number(),
    },
    rules: { total: { value: (values) => (values.alternate ? values.b : values.a) } },
  });
  const session = createSession(definition);
  session.edit("alternate", true);
  session.reset();
  assert.equal(session.getSnapshot().values.total, 2);
  session.edit("a", 3);
  assert.equal(session.getSnapshot().values.total, 3);
});

test("a formula with no arguments writes its literal at opening unless the value is supplied", () => {
  const definition = defineForm({
    fields: {
      status: field.select({
        options: [
          { value: "draft", label: "Draft" },
          { value: "ready", label: "Ready" },
        ],
      }),
    },
    rules: { status: { value: () => "ready" } },
  });
  assert.equal(createSession(definition).getSnapshot().values.status, "ready");
  assert.equal(
    createSession(definition, { initial: { status: null } }).getSnapshot().values.status,
    null,
  );
  const session = createSession(definition);
  session.edit("status", "draft");
  assert.equal(session.getSnapshot().values.status, "draft");
  // A field that initial has as its own property prevails, also when it is not
  // enumerable: it gives no value, so the field keeps its default.
  const hidden = Object.defineProperty({}, "status", { value: "ready" });
  assert.equal(createSession(definition, { initial: hidden }).getSnapshot().values.status, null);
});

test("the definition preserves the declared formula even if the author modifies their objects", () => {
  const entry = { value: () => 1 };
  const rules = { total: entry };
  const definition = defineForm({ fields: { total: field.number() }, rules });
  entry.value = () => 2;
  rules.total = { value: () => 3 };
  assert.equal(createSession(definition).getSnapshot().values.total, 1);
});
