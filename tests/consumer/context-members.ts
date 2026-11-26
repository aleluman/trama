// The key probes of members.ts, undefined.tsx and async-forms.ts, repeated
// with a declared context. Each negative fails for the reason its directive
// gives.
import { createSession, declareContext, defineForm, field } from "trama-forms/core";
import { defineForm as boundForm, field as bound } from "./async.js";

type Mode = { mode: "create" | "edit" | "view" };
const shape = { country: field.text(), city: field.text(), total: field.number() };
const enabled = Math.random() < 2;
const good = () => ({ city: "Madrid" });
const bad = () => ({ city: "Madrid", citi: "typo" });

// Conditional entries and unions of valid handlers compile with a context.
defineForm({
  context: declareContext<Mode>(),
  fields: shape,
  rules: {
    ...(enabled && { country: { onChange: good } }),
    city: { onChange: enabled ? good : (_, { context }) => ({ total: context.mode.length }) },
  },
});
const misspelled = { value: () => "ES", valeu: () => "MX" };
defineForm({
  context: declareContext<Mode>(),
  fields: shape,
  // @ts-expect-error A conditional entry cannot hide a misspelled property.
  rules: { ...(enabled && { country: misspelled }) },
});
const pick = (on: boolean): typeof bad | typeof good => (on ? bad : good);
defineForm({
  fields: shape,
  // @ts-expect-error A helper that returns either handler keeps the union.
  rules: { country: { onChange: pick(enabled) } },
  context: declareContext<Mode>(),
});
const validRules = { city: { hidden: () => true } };
const typoRules = { city: { hidden: () => true, hiden: () => true } };
const rulesFrom = (on: boolean): typeof validRules | typeof typoRules =>
  on ? typoRules : validRules;
defineForm({
  fields: shape,
  context: declareContext<Mode>(),
  // @ts-expect-error A union of rules sections cannot hide a misspelled property.
  rules: rulesFrom(enabled),
});
const reusedLock = { readOnly: { value: () => true, exept: ["city"] } };
defineForm({
  context: declareContext<Mode>(),
  fields: shape,
  // @ts-expect-error A reused form section keeps its checks.
  form: reusedLock,
});
defineForm({
  context: declareContext<Mode>(),
  fields: shape,
  // @ts-expect-error A section that may be undefined keeps its checks.
  rules: enabled ? { citi: {} } : undefined,
});

// Required params, with a context.
const fields = { customer: bound.async("customers"), contact: bound.async("contacts") };
boundForm({
  context: declareContext<Mode>(),
  fields,
  rules: { contact: { params: (_, { context }) => ({ customer: context.mode.length }) } },
});
// @ts-expect-error params is required when the endpoint requires params.
boundForm({ context: declareContext<Mode>(), fields });
boundForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error A conditional entry cannot hold required params.
  rules: { ...(enabled && { contact: { params: () => ({ customer: 1 }) } }) },
});
// A field whose definition is either endpoint requires what either one needs.
const either = enabled ? bound.async("contacts") : bound.async("customers");
// @ts-expect-error params is required when a member of the field's definition requires it.
boundForm({ context: declareContext<Mode>(), fields: { either } });
const eitherForm = boundForm({
  context: declareContext<Mode>(),
  fields: { either },
  rules: { either: { params: (_, { context }) => ({ customer: context.mode.length }) } },
});
createSession(eitherForm, { scope: 1, context: { mode: "edit" } });
// @ts-expect-error initial values cannot be undefined, with a context too.
createSession(eitherForm, { scope: 1, context: { mode: "edit" }, initial: { either: undefined } });

// A read-only context is accepted: the one a tool receives, or readonly arrays.
type Tagged = { tags: string[]; limits: { max: number } };
const tagged = defineForm({ context: declareContext<Tagged>(), fields: shape });
const readonlyTags: readonly string[] = ["vip"];
createSession(tagged, { context: { tags: readonlyTags, limits: { max: 3 } } });
const tools = defineForm({
  context: declareContext<Tagged>(),
  fields: shape,
  rules: {
    city: {
      label: (_, { context: received }) => {
        createSession(tagged, { context: received });
        return received.tags.join(", ");
      },
    },
  },
});
void tools;
// @ts-expect-error A context without properties would take any value, as 5.
defineForm({ context: declareContext<{}>(), fields: shape });
