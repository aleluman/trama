import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, defineForm, field } from "trama-forms/core";
import { currentOutputs } from "./helpers/session.mjs";

const options = [
  { value: "ES", label: "Spain" },
  { value: "MX", label: "Mexico" },
];
const fields = {
  country: field.select({ options }),
  city: field.text({ label: "City" }),
  total: field.number(),
  confirmed: field.checkbox(),
};
const city = ({ country }) => (country === "ES" ? "Madrid" : undefined);
const noCountry = ({ country }) => country === null;
const confirmedReason = ({ confirmed }) => confirmed && "Confirmed";
const lock = ({ confirmed }) => confirmed;

// What a session publishes when it opens, after each edit and after reset.
const trace = (definition, sessionOptions) => {
  const session = createSession(definition, sessionOptions);
  const seen = [];
  const record = () => seen.push({ ...session.getSnapshot(), outputs: currentOutputs(session) });
  record();
  for (const [name, value] of [
    ["country", "ES"],
    ["total", 5],
    ["confirmed", true],
    ["country", null],
  ]) {
    session.edit(name, value);
    record();
  }
  session.reset();
  record();
  return seen;
};
const same = (omitted, explicit) =>
  assert.deepEqual(trace(defineForm(explicit)), trace(defineForm(omitted)));

test("undefined is equivalent to omitting an optional field property or defineForm section", () => {
  same(
    { fields },
    {
      fields: {
        country: field.select({
          options,
          label: undefined,
          default: undefined,
          disabled: undefined,
          readOnly: undefined,
          hidden: undefined,
          required: undefined,
        }),
        city: field.text({ label: "City", placeholder: undefined, default: undefined }),
        total: { type: "number", label: undefined, placeholder: undefined, default: undefined },
        confirmed: field.checkbox({ label: undefined, default: undefined }),
      },
      rules: undefined,
      form: undefined,
      outputs: undefined,
    },
  );
});

test("undefined is equivalent to omitting a rules entry, an entry property, or a form lock property", () => {
  same(
    {
      fields,
      rules: { city: { value: city, hidden: noCountry }, total: { disabled: confirmedReason } },
      form: { readOnly: [{ value: lock, except: ["confirmed"] }, { value: lock }] },
    },
    {
      fields,
      rules: {
        country: undefined,
        city: {
          value: city,
          disabled: undefined,
          readOnly: undefined,
          hidden: noCountry,
          required: undefined,
          label: undefined,
          placeholder: undefined,
          states: undefined,
          onChange: undefined,
        },
        total: { value: undefined, disabled: confirmedReason, placeholder: undefined },
        confirmed: undefined,
      },
      form: {
        readOnly: [
          { value: lock, except: ["confirmed"] },
          { value: lock, except: undefined },
        ],
      },
    },
  );
  same({ fields, form: {} }, { fields, form: { readOnly: undefined } });
});

test("undefined is equivalent to omitting a createSession or watchOutputs option", (t) => {
  const definition = defineForm({
    fields,
    outputs: ({ output }) => ({ total: output(({ total }) => total ?? 0) }),
  });
  assert.deepEqual(trace(definition, { initial: undefined }), trace(definition, {}));
  const outputs = [];
  createSession(definition).watchOutputs((all) => outputs.push(all.total), {
    onError: undefined,
  })();
  assert.deepEqual(outputs, [0]);
  // Without onError, a failing callback reports its original error.
  const reported = [];
  const oldReport = Object.getOwnPropertyDescriptor(globalThis, "reportError");
  Object.defineProperty(globalThis, "reportError", {
    configurable: true,
    value: (error) => reported.push(error),
  });
  t.after(() => {
    if (oldReport) Object.defineProperty(globalThis, "reportError", oldReport);
    else delete globalThis.reportError;
  });
  const failure = new Error("Observer failed");
  const fail = () => {
    throw failure;
  };
  createSession(definition).watchOutputs(fail)();
  createSession(definition).watchOutputs(fail, { onError: undefined })();
  assert.deepEqual(reported, [failure, failure]);
});

test("an undefined rules entry is skipped only after checking that the field exists", () => {
  for (const name of ["ghost", "toString", "__proto__"])
    assert.throws(() => defineForm({ fields, rules: { [name]: undefined } }), {
      message: `Rules: unknown field "${name}"`,
    });
  assert.throws(() => defineForm({ fields, rules: { city: null } }), {
    message: 'Field "city" rules: expected an object of properties',
  });
});

test("with undefined, unknown keys and missing required members are still rejected", () => {
  const known = { title: field.text(), size: field.select({ options }) };
  for (const [config, message] of [
    [
      { fields: known, ghost: undefined },
      "Form configuration requires fields and optional collections/context/defaults/include/rules/form/outputs",
    ],
    [{ fields: undefined }, "Form fields must be an object"],
    [
      { fields: { size: field.select({ options: undefined }) } },
      'Field "size" (select): options must be an array',
    ],
    [
      { fields: known, rules: { title: { ghost: undefined } } },
      'Field "title" rules: unknown property "ghost"',
    ],
    [
      { fields: known, rules: { size: { placeholder: undefined } } },
      'Field "size" placeholder: select fields have no placeholder',
    ],
    [
      { fields: known, rules: { title: { hidden: [undefined] } } },
      'Field "title" hidden[0]: formula must be a function',
    ],
    [
      { fields: known, form: { ghost: undefined } },
      'Form section "form": unknown property "ghost"',
    ],
    [
      { fields: known, form: { readOnly: { value: undefined } } },
      "Form readOnly: formula must be a function",
    ],
    [
      { fields: known, form: { readOnly: { value: () => true, ghost: undefined } } },
      'Form readOnly: unknown property "ghost"',
    ],
  ])
    assert.throws(() => defineForm(config), { message });
});
