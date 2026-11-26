import { createSession, defineForm, field, type FormValues } from "trama-forms/core";

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
  level: field.select({
    options: [
      { value: 1, label: "One" },
      { value: 2, label: "Two" },
    ],
  }),
};

// Rules come first and fields last: sections keep any order.
const order = defineForm({
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    city: {
      value: ({ useCapital, country }) =>
        useCapital && country !== null ? capitals[country] : undefined,
    },
    price: { value: (values, { peek }) => (values.quantity === 0 ? peek.price : null) },
    useCapital: { value: (_, { peek: { city } }) => city === "" },
  },
  outputs: ({ output }) => ({ doubled: output((values) => (values.total ?? 0) * 2) }),
  fields: shape,
});
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const inferred: Equal<
  FormValues<typeof order>,
  {
    quantity: number | null;
    price: number | null;
    total: number | null;
    country: "ES" | "MX" | "JP" | null;
    city: string;
    useCapital: boolean;
    level: 1 | 2 | null;
  }
> = true;
void inferred;
const session = createSession(order, { initial: { total: 9500 } });
session.edit("total", null);
session.watchOutputs(({ doubled }) => void (doubled satisfies number));

// Formulas without arguments keep their literal results.
defineForm({
  fields: shape,
  rules: {
    country: { value: () => "JP" },
    level: { value: () => 2 },
    useCapital: { value: () => true },
    city: { value: () => "" },
    total: { value: () => 0 },
    quantity: { value: () => null },
    price: {},
  },
});
defineForm({ fields: shape, rules: {} });
const validEntry = { value: () => 1 };
defineForm({ fields: shape, rules: { total: validEntry } });

// Names of rules, properties, reads and helpers are closed.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Rules name fields of the definition.
    totl: { value: () => 1 },
  },
});
const reusedRules = { totl: { value: () => 1 } };
defineForm({
  fields: shape,
  // @ts-expect-error A reused rules object cannot hide an unknown field.
  rules: reusedRules,
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Properties of a rule entry are closed.
    total: { valeu: () => 1 },
  },
});
const reusedEntry = { value: () => 1, valeu: () => 2 };
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused entry cannot hide a misspelled property.
    total: reusedEntry,
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A formula belongs under value, not directly under the field.
    total: () => 1,
  },
});
defineForm({
  fields: shape,
  // @ts-expect-error Rules are an object keyed by field, not a function.
  rules: () => ({ total: { value: () => 1 } }),
});
defineForm({
  fields: shape,
  // @ts-expect-error A function that receives tools is not an object of rules either.
  rules: (tools: { readonly derive: unknown }) => ({ total: { value: [tools.derive] } }),
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A formula must be a function.
    total: { value: 1 },
  },
});
defineForm({
  fields: shape,
  // @ts-expect-error Destructured reads name fields of the definition.
  rules: { total: { value: ({ quantty }) => (quantty === undefined ? 0 : 1) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Member reads name fields of the definition.
  rules: { total: { value: (values) => (values.quantty === undefined ? 0 : 1) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Peek reads name fields of the definition.
  rules: { total: { value: (_, { peek }) => (peek.quantty === undefined ? 0 : 1) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Destructured peek reads name fields of the definition.
  rules: { total: { value: (_, { peek: { quantty } }) => (quantty === undefined ? 0 : 1) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Formulas receive only peek as a helper.
  rules: { total: { value: (_, { read }) => (read === undefined ? 0 : 1) } },
});

// Results must belong to the field domain.
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A number field does not accept text.
    total: { value: () => "10" },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A text field does not accept null.
    city: { value: () => null },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A checkbox does not accept null.
    useCapital: { value: () => null },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A select accepts only its option literals.
    country: { value: () => "BR" },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A numeric select accepts only its option literals.
    level: { value: () => 3 },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Computed text is not a select literal.
    country: { value: ({ city }) => city },
  },
});
const text = () => "10";
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused formula keeps the field domain.
    total: { value: text },
  },
});
const textEntry = { value: () => "10" };
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A reused entry keeps the field domain.
    total: textEntry,
  },
});

// Formulas are synchronous and read-only.
defineForm({
  fields: shape,
  rules: {
    total: {
      // @ts-expect-error Async formulas are rejected.
      value: async () => {
        await Promise.resolve();
        return 1;
      },
    },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error Promise results are rejected.
    total: { value: () => Promise.resolve(1) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A union with a promise is asynchronous.
    total: { value: ({ useCapital }) => (useCapital ? 1 : Promise.resolve(1)) },
  },
});
defineForm({
  fields: shape,
  rules: {
    total: {
      value: (values) => {
        // @ts-expect-error Values are readonly.
        values.total = 1;
        return 1;
      },
    },
  },
});
defineForm({
  fields: shape,
  rules: {
    total: {
      value: (_, { peek }) => {
        // @ts-expect-error Peek is readonly.
        peek.price = 1;
        return 1;
      },
    },
  },
});
