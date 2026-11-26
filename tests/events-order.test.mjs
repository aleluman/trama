import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";

const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };
const countries = [
  { value: "ES", label: "Spain" },
  { value: "MX", label: "Mexico" },
  { value: "JP", label: "Japan" },
];

test("Between a formula and an event, the last declared writer wins even if it was evaluated earlier", () => {
  const fields = {
    quantity: field.number({ default: 2 }),
    price: field.number({ default: 10 }),
    total: field.number(),
  };
  const formula = {
    value: ({ quantity, price }) => (quantity === 7 ? undefined : (quantity ?? 0) * (price ?? 0)),
  };
  const event = { onChange: ({ quantity }) => ({ total: quantity === 5 ? undefined : 0 }) };
  // The event runs when quantity settles, before total resolves its formula.
  const eventLast = createSession(
    defineForm({ fields, rules: { total: formula, quantity: event } }),
  );
  const formulaLast = createSession(
    defineForm({ fields, rules: { quantity: event, total: formula } }),
  );
  eventLast.edit("quantity", 3);
  formulaLast.edit("quantity", 3);
  assert.equal(eventLast.getSnapshot().values.total, 0);
  assert.equal(formulaLast.getSnapshot().values.total, 30);
  for (const session of [eventLast, formulaLast]) {
    session.edit("price", 11);
    assert.equal(session.getSnapshot().values.total, 33, "Only the formula writes");
    session.edit("quantity", 5);
    assert.equal(session.getSnapshot().values.total, 55, "An undefined value does not compete");
    session.edit("quantity", 7);
    assert.equal(
      session.getSnapshot().values.total,
      0,
      "A formula that does not write does not compete",
    );
  }
});

test("Between two events that write the same field, the last one declared wins", () => {
  const fields = { a: field.number(), b: field.number(), target: field.text() };
  const a = { onChange: () => ({ target: "a" }) };
  const b = { value: ({ a: value }) => value, onChange: () => ({ target: "b" }) };
  for (const [rules, expected] of [
    [{ a, b }, "b"],
    [{ b, a }, "a"],
  ]) {
    const session = createSession(defineForm({ fields, rules }));
    session.edit("a", 1);
    assert.deepEqual(session.getSnapshot().values, { a: 1, b: 1, target: expected });
  }
});

test("A destination that another rule already read rebuilds the candidate without invoking the event again", () => {
  let calls = 0;
  const definition = defineForm({
    // summary reads city before country settles and reveals that its event writes city.
    fields: {
      summary: field.text(),
      city: field.text(),
      country: field.select({ options: countries, default: "ES" }),
    },
    rules: {
      summary: { value: ({ city }) => `City: ${city}` },
      country: {
        onChange: ({ country }) => {
          calls++;
          return { city: country === null ? "" : capitals[country] };
        },
      },
    },
  });
  const session = createSession(definition);
  const observed = [];
  session.subscribe(() => observed.push(session.getSnapshot().values));
  session.edit("country", "MX");
  session.edit("country", "JP");
  assert.deepEqual(
    observed.map(({ summary }) => summary),
    ["City: Mexico City", "City: Tokyo"],
  );
  assert.equal(calls, 2);
});

test("An event that reads a value that later changes is invoked again and only its final result is applied", () => {
  const seen = [];
  const calls = { b: 0 };
  const definition = defineForm({
    fields: {
      a: field.number({ default: 1 }),
      b: field.number(),
      zone: field.text(),
      summary: field.text(),
    },
    rules: {
      // a.onChange reads zone before b.onChange reveals that it writes zone.
      a: {
        onChange: ({ a, zone }) => {
          seen.push(zone);
          return { summary: `${a}/${zone}` };
        },
      },
      b: {
        value: ({ a }) => (a ?? 0) * 2,
        onChange: ({ b }) => {
          calls.b++;
          return { zone: `Z${b}` };
        },
      },
    },
  });
  const session = createSession(definition);
  session.edit("a", 2);
  assert.deepEqual(session.getSnapshot().values, { a: 2, b: 4, zone: "Z4", summary: "2/Z4" });
  assert.deepEqual(seen, ["", "Z4"]);
  assert.equal(calls.b, 1);
  session.edit("a", 3);
  assert.deepEqual(seen, ["", "Z4", "Z4", "Z6"]);
});

test("A rebuilt candidate keeps neither values nor reads from its discarded attempt", () => {
  const definition = defineForm({
    fields: {
      y: field.number({ default: 0 }),
      b: field.number({ default: 1 }),
      c: field.number({ default: 2 }),
      x: field.number(),
      a: field.number({ default: 0 }),
    },
    rules: {
      y: { value: ({ a }) => a },
      // With y at 5, the discarded attempt reads b; the committed reads stay y and c.
      x: { value: (values) => ((values.y ?? 0) > 0 ? values.b : values.c) },
      // Declared last, it writes y back to its previous value after y settled.
      a: { onChange: () => ({ y: 0 }) },
    },
  });
  const session = createSession(definition);
  session.edit("a", 5);
  assert.deepEqual(session.getSnapshot().values, { y: 0, b: 1, c: 2, x: 2, a: 5 });
  session.edit("c", 3);
  assert.equal(session.getSnapshot().values.x, 3);
  session.edit("b", 7);
  assert.equal(session.getSnapshot().values.x, 3);
});

test("A formula that fails on a value an event later writes does not reject the operation", () => {
  const within = { Madrid: "ES", "Mexico City": "MX", Tokyo: "JP" };
  const consistent = (city, country) => {
    if (city !== "" && within[city] !== country) throw new Error(`${city} is not in ${country}`);
  };
  const definition = defineForm({
    // zone and label read city before country settles; its event writes city afterwards.
    fields: {
      zone: field.text(),
      label: field.text(),
      country: field.select({ options: countries, default: "ES" }),
      city: field.text(),
    },
    rules: {
      zone: {
        value: ({ country, city }) => {
          consistent(city, country);
          return `${country}-${city}`;
        },
        onChange: ({ zone, city, country }) => {
          consistent(city, country);
          return { label: `Zone ${zone}` };
        },
      },
      country: { onChange: ({ country }) => ({ city: country === null ? "" : capitals[country] }) },
    },
  });
  const session = createSession(definition, { initial: { city: "Madrid" } });
  session.edit("country", "MX");
  assert.deepEqual(session.getSnapshot().values, {
    zone: "MX-Mexico City",
    label: "Zone MX-Mexico City",
    country: "MX",
    city: "Mexico City",
  });
});

// Reads y after catching the failure of x.
const settle = (values) => {
  try {
    void values.x;
  } catch {}
  return values.y;
};

test("A restart takes precedence over a failure already caught by the formula or event", () => {
  const fields = {
    m: field.number(),
    a: field.number({ default: 1 }),
    x: field.number(),
    y: field.number(),
    b: field.number(),
    c: field.number(),
    gate: field.checkbox(),
    z: field.checkbox(),
  };
  // x fails until z is written. Once gate is set, the event of b also writes z,
  // which x already consumed, so reading y from m starts the candidate again.
  const common = {
    x: {
      value: ({ a, z }) => {
        if ((a ?? 0) > 1 && !z) throw new Error("z pending");
        return a;
      },
    },
    b: { value: ({ a }) => a, onChange: ({ gate }) => (gate ? { y: 5, z: true } : { y: 5 }) },
    c: { value: ({ a }) => a, onChange: () => ({ gate: true }) },
  };
  // The reader of m, a formula or an event, catches the failure of x before reading y.
  const readers = {
    formula: { m: { value: settle } },
    event: { a: { onChange: (values) => ({ m: settle(values) }) } },
  };
  for (const [reader, rules] of Object.entries(readers))
    for (const order of [Object.keys(fields), ["a", "b", "c", "gate", "z", "y", "x", "m"]]) {
      const session = createSession(
        defineForm({
          fields: Object.fromEntries(order.map((name) => [name, fields[name]])),
          rules: { ...common, ...rules },
        }),
      );
      session.edit("a", 2);
      assert.deepEqual(
        session.getSnapshot().values,
        { m: 5, a: 2, x: 2, y: 5, b: 2, c: 2, gate: true, z: true },
        `${reader}, ${order.join(" ")}`,
      );
    }
});

test("An event that fails on a value another event later writes does not reject the operation", () => {
  const events = defineForm({
    fields: {
      a: field.number({ default: 1 }),
      b: field.number(),
      zone: field.text(),
      summary: field.text(),
    },
    rules: {
      a: {
        onChange: ({ a, zone }) => {
          if (zone !== `Z${(a ?? 0) * 2}`) throw new Error(`Zone ${zone} is stale`);
          return { summary: zone };
        },
      },
      b: { value: ({ a }) => (a ?? 0) * 2, onChange: ({ b }) => ({ zone: `Z${b}` }) },
    },
  });
  const other = createSession(events);
  other.edit("a", 2);
  assert.deepEqual(other.getSnapshot().values, { a: 2, b: 4, zone: "Z4", summary: "Z4" });
});

test("defineForm rejects field names that JavaScript orders as indexes, including with rules", () => {
  for (const name of ["0", "7", "2024", "4294967294"]) {
    const message = `Field "${name}": names that JavaScript orders as indices are not allowed`;
    assert.throws(() => defineForm({ fields: { title: field.text(), [name]: field.text() } }), {
      message,
    });
    assert.throws(() => defineForm({ fields: { [name]: field.number() }, rules: {} }), {
      message,
    });
  }
  const kept = defineForm({
    fields: {
      b: field.text(),
      4294967295: field.text(),
      "01": field.text(),
      "-1": field.text(),
      1.5: field.text(),
    },
  });
  assert.deepEqual(Object.keys(createSession(kept).getSnapshot().values), [
    "b",
    "4294967295",
    "01",
    "-1",
    "1.5",
  ]);
});
