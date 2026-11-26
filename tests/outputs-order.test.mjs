import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs, outputFailure } from "./helpers/session.mjs";

const currency = { code: "JPY", taxRate: 0.2 };
const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };

// The order example defines rules by field property.
const order = defineForm({
  fields: {
    customer: field.text({ label: "Customer", placeholder: "Name or business name" }),
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
    useCapital: field.checkbox({ label: "Use the capital when the country changes" }),
    includeNote: field.checkbox({ label: "Include delivery note", default: true }),
    confirmed: field.checkbox({ label: "Order confirmed" }),
    note: field.text({ label: "Delivery note", default: "Leave at the front desk" }),
  },
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    country: {
      onChange: ({ country, useCapital }, { toDefaults }) =>
        useCapital && country !== null ? { city: capitals[country] } : toDefaults("city"),
    },
    note: { disabled: [({ includeNote }) => !includeNote, ({ confirmed }) => confirmed] },
  },
  outputs: ({ output }) => {
    const net = output(({ total }) => total ?? 0);
    const totals = output((_, { read }) => {
      const rounded = Math.round(read(net));
      const tax = Math.round(read(net) * currency.taxRate);
      return { net: rounded, tax, gross: rounded + tax };
    });
    const caption = output((_, { read }) => `Total: ${read(totals).gross} ${currency.code}`);
    const unitPrice = output(({ quantity }, { read }) => {
      if (quantity === null || quantity <= 0) throw new Error("Quantity must be greater than zero");
      return read(net) / quantity;
    });
    const unitCaption = output(
      (_, { read }) => `${read(unitPrice).toFixed(2)} ${currency.code} per unit`,
    );
    return { totals, caption, unitPrice, unitCaption };
  },
});

test("chained order outputs use (values, { read }) and isolate the unitPrice failure", () => {
  const session = createSession(order);
  const units = [];
  session.watchOutputs(({ unitCaption }) => units.push(unitCaption), {
    onError: (error) => units.push(error),
  });
  const { totals, caption, unitPrice, unitCaption } = currentOutputs(session);
  assert.deepEqual(totals, { net: 10000, tax: 2000, gross: 12000 });
  assert.equal(caption, "Total: 12000 JPY");
  assert.equal(unitPrice, 5000);
  assert.equal(unitCaption, "5000.00 JPY per unit");

  session.edit("quantity", null);
  assert.equal(session.getSnapshot().values.quantity, null, "The edit is accepted");
  assert.equal(currentOutputs(session).caption, "Total: 0 JPY");
  assert.deepEqual(currentOutputs(session).totals, { net: 0, tax: 0, gross: 0 });
  const unit = outputFailure(session, "unitPrice");
  assert.match(unit.message, /^Output "unitPrice": calculation failed: .*greater than zero/u);
  const chained = units.at(-1);
  assert.match(chained.message, /unitCaption.*unitPrice.*greater than zero/u);
  assert.equal(chained.cause.cause, unit.cause);

  session.edit("quantity", 4);
  assert.equal(units.at(-1), "5000.00 JPY per unit", "It recovers without resubscribing");
  session.edit("total", 21000);
  assert.equal(currentOutputs(session).unitPrice, 5250);
  assert.equal(currentOutputs(session).caption, "Total: 25200 JPY");
  session.reset();
  assert.equal(currentOutputs(session).caption, "Total: 12000 JPY");
  assert.equal(units.at(-1), "5000.00 JPY per unit");

  const empty = createSession(order, { initial: { quantity: 0 } });
  assert.equal(currentOutputs(empty).caption, "Total: 0 JPY", "It opens even if unitPrice fails");
  assert.match(outputFailure(empty, "unitCaption").message, /unitCaption/u);
});
