import { createSession, defineForm, field } from "trama-forms/core";

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

// The public example: rules come first and fields last, sections keep any order.
const order = defineForm({
  rules: {
    total: { value: ({ quantity, price }) => (quantity ?? 0) * (price ?? 0) },
    country: {
      onChange: ({ country, useCapital }, { toDefaults }) =>
        useCapital && country !== null ? { city: capitals[country] } : toDefaults("city"),
    },
  },
  fields: shape,
});
createSession(order).edit("country", "MX");

// Patches write several fields, compose with spread and leave undefined keys unwritten.
defineForm({
  fields: shape,
  rules: {
    country: {
      value: () => "JP",
      onChange: ({ country }, { toDefaults }) => ({
        ...toDefaults("city", "level", "total", "useCapital"),
        level: country === "MX" ? 2 : undefined,
        quantity: null,
      }),
    },
    level: { onChange: () => ({}) },
    city: { onChange: (_, { toDefaults }) => toDefaults() },
    useCapital: { onChange: ({ useCapital }) => (useCapital ? { city: "" } : undefined) },
    quantity: { onChange: () => ({ country: "MX", level: 1, useCapital: true, total: 0 }) },
  },
});
const reusedEvent = { onChange: () => ({ city: "Madrid" }) };
defineForm({ fields: shape, rules: { country: reusedEvent } });

// Patch keys are fields of the definition, also in reused objects and helpers.
defineForm({
  fields: shape,
  // @ts-expect-error A patch writes only fields of the definition.
  rules: { country: { onChange: () => ({ citi: "" }) } },
});
const withTypo = (city: string) => ({ city, totl: 0 });
defineForm({
  fields: shape,
  // @ts-expect-error A patch returned by a helper cannot hide an unknown field.
  rules: { country: { onChange: ({ city }) => withTypo(city) } },
});
const extra = { citi: "" };
defineForm({
  fields: shape,
  // @ts-expect-error A spread cannot hide an unknown field.
  rules: { country: { onChange: () => ({ ...extra, city: "" }) } },
});
const reusedTypo = { onChange: () => ({ city: "", totl: 0 }) };
defineForm({
  fields: shape,
  // @ts-expect-error A reused entry cannot hide an unknown field in its patch.
  rules: { country: reusedTypo },
});

// Patch values belong to the field domain.
defineForm({
  fields: shape,
  // @ts-expect-error A text field does not accept null.
  rules: { country: { onChange: () => ({ city: null }) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error A checkbox does not accept null.
  rules: { country: { onChange: () => ({ useCapital: null }) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error A select accepts only its option literals.
  rules: { city: { onChange: () => ({ country: "ZZ" }) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error A numeric select accepts only its option literals.
  rules: { city: { onChange: () => ({ level: 3 }) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error A number field does not accept text.
  rules: { city: { onChange: ({ city }) => ({ total: city }) } },
});
const textPatch = () => ({ total: "10" });
defineForm({
  fields: shape,
  // @ts-expect-error A reused event keeps the field domain.
  rules: { city: { onChange: textPatch } },
});

// Events are synchronous and return a patch or undefined.
defineForm({
  fields: shape,
  rules: {
    country: {
      // @ts-expect-error Async events are rejected.
      onChange: async () => {
        await Promise.resolve();
        return { city: "" };
      },
    },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A union with a promise is asynchronous.
    country: { onChange: ({ useCapital }) => (useCapital ? { city: "" } : Promise.resolve({})) },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error false is not a patch.
    country: { onChange: ({ useCapital }) => useCapital && { city: "" } },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error A value is not a patch.
    country: { onChange: () => "Madrid" },
  },
});

// Helpers and values are closed and readonly.
defineForm({
  fields: shape,
  // @ts-expect-error toDefaults names fields of the definition.
  rules: { country: { onChange: (_, { toDefaults }) => toDefaults("citi") } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Events receive only toDefaults as a helper.
  rules: { country: { onChange: (_, { peek }) => ({ city: String(peek) }) } },
});
defineForm({
  fields: shape,
  // @ts-expect-error Event reads name fields of the definition.
  rules: { country: { onChange: ({ citi }) => ({ city: String(citi) }) } },
});
defineForm({
  fields: shape,
  rules: {
    country: {
      onChange: (values) => {
        // @ts-expect-error Values are readonly.
        values.city = "";
        return {};
      },
    },
  },
});
defineForm({
  fields: shape,
  rules: {
    // @ts-expect-error An event must be a function.
    country: { onChange: { city: "" } },
  },
});
defineForm({
  fields: shape,
  // @ts-expect-error A numeric key is not a patch field.
  rules: { country: { onChange: () => ({ city: "Madrid", 1: "One" }) } },
});
