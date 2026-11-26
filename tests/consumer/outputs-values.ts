import { createSession, defineForm, field } from "trama-forms/core";

const currency = { code: "JPY", taxRate: 0.2 };
const capitals = { ES: "Madrid", MX: "Mexico City", JP: "Tokyo" };
const shape = {
  quantity: field.number({ default: 2 }),
  price: field.number({ default: 5000 }),
  total: field.number(),
  country: field.select({
    options: [
      { value: "ES", label: "Spain" },
      { value: "MX", label: "Mexico" },
      { value: "JP", label: "Japan" },
    ],
    default: "ES",
  }),
  city: field.text(),
  useCapital: field.checkbox(),
  status: field.select({ options: [{ value: "ready", label: "Ready" }] }),
};
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// The outputs of the public example, with outputs first and fields last.
const order = defineForm({
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
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    country: {
      onChange: ({ country, useCapital }, { toDefaults }) =>
        useCapital && country !== null ? { city: capitals[country] } : toDefaults("city"),
    },
  },
  fields: shape,
});
createSession(order).watchOutputs(({ totals, caption, unitPrice, unitCaption }) => {
  totals satisfies { readonly net: number; readonly tax: number; readonly gross: number };
  caption satisfies string;
  unitPrice satisfies number;
  unitCaption satisfies string;
});

// values alone, destructured, with read, the tools object whole and no arguments.
const forms = defineForm({
  fields: shape,
  outputs: ({ output }) => {
    const whole = output((values) => ({ status: values.status, city: values.city }));
    const destructured = output(({ status, ...rest }) => [status, rest.total] as const);
    const both = output(({ country }, { read }) => `${country ?? "-"} ${read(whole).city}`);
    const fromTools = output((_, tools) => tools.read(destructured)[0]);
    const literal = output(() => "ready");
    return { whole, destructured, both, fromTools, literal };
  },
});
createSession(forms).watchOutputs(({ whole, destructured, both, fromTools, literal }) => {
  whole.status satisfies "ready" | null;
  destructured satisfies readonly ["ready" | null, number | null];
  both satisfies string;
  fromTools satisfies "ready" | null;
  const exact: Equal<typeof literal, "ready"> = true;
  void exact;
});

// Reads are closed to the fields of the definition, in the new signature only.
defineForm({
  fields: shape,
  outputs: ({ output }) => {
    const net = output(({ total }) => total ?? 0);
    // @ts-expect-error Unknown fields cannot be destructured.
    output(({ totl }) => (totl === undefined ? 0 : 1));
    // @ts-expect-error Unknown fields cannot be read.
    output((values) => (values.totl === undefined ? 0 : 1));
    // @ts-expect-error The previous signature received a context with values.
    output(({ values }) => (values === undefined ? 0 : 1));
    // @ts-expect-error The previous signature received read in its context.
    output(({ read }) => (read === undefined ? 0 : 1));
    // @ts-expect-error Values and read are no longer one context.
    output(({ values, read }) => (values === read ? 0 : 1));
    // @ts-expect-error Outputs receive read, not peek.
    output((_, { peek }) => (peek === undefined ? 0 : 1));
    // @ts-expect-error Values are readonly.
    output((values) => (values.total = 1));
    output((_, tools) => {
      const read = tools.read;
      // @ts-expect-error The tools are frozen, so read cannot be replaced.
      tools.read = read;
      return 0;
    });
    // @ts-expect-error Async formulas are outside the contract.
    output(async ({ total }) => {
      await Promise.resolve();
      return total;
    });
    // @ts-expect-error Unions cannot hide a promise.
    output(({ total }) => (total === null ? 0 : Promise.resolve(total)));
    return { net };
  },
});

// References belong to the definition that created them, even with equal fields.
defineForm({
  fields: shape,
  outputs: ({ output }) => {
    const mine = output(({ total }) => total ?? 0);
    defineForm({
      fields: shape,
      outputs: ({ output: otherOutput }) => {
        // @ts-expect-error A reference from another definition cannot be read.
        otherOutput((_, { read }) => read(mine));
        return {};
      },
    });
    defineForm({
      fields: shape,
      // @ts-expect-error A reference from another definition cannot be returned.
      outputs: () => ({ mine }),
    });
    return { mine };
  },
});

// Rules keyed by field do not read outputs.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A value formula has no read.
    total: { value: (_, { read }) => (read === undefined ? 0 : 1) },
    // @ts-expect-error An event has no read.
    country: { onChange: (_, { read }) => (read === undefined ? undefined : {}) },
  },
  outputs: ({ output }) => ({ net: output(({ total }) => total ?? 0) }),
});
