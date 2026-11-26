// Context and defaults through the installed package. Positives compile
// without casts; each negative fails for the reason its directive gives.
import {
  createSession,
  declareContext,
  defineForm,
  field,
  type DeepReadonly,
  type FormContext,
  type FormDefinition,
} from "trama-forms/core";
import { defineForm as boundForm, field as bound, type Customer } from "./async.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const enabled = Math.random() < 2;
type Mode = {
  mode: "create" | "edit" | "view";
  today: string;
  currency: { code: string; taxRate: number };
};
const ctx: Mode = { mode: "edit", today: "2026-09-27", currency: { code: "JPY", taxRate: 0.2 } };
const fields = {
  title: field.text(),
  deliveryDate: field.text({ placeholder: "YYYY-MM-DD" }),
  total: field.number(),
  confirmed: field.checkbox(),
};

// ------------------------------------------------------------- positives
// Context after rules and before fields; every tool family reads it.
const order = defineForm({
  rules: {
    title: {
      value: (_, { peek, context }) => (peek.confirmed ? undefined : context.mode),
      disabled: [(_, { context }) => context.mode === "view", () => false],
      readOnly: (_, { context }) => context.mode === "view" && "Read-only",
      hidden: [(_, { context }) => context.mode === "create"],
      label: (_, { context }) => context.currency.code,
      states: (_, { context }) => ({ total: { hidden: context.mode === "create" } }),
      onChange: (_, { toDefaults, context }) =>
        context.mode === "view" ? undefined : toDefaults("deliveryDate"),
    },
    deliveryDate: { placeholder: (_, { context }) => context.today },
  },
  context: declareContext<Mode>(),
  form: {
    readOnly: [
      { value: ({ confirmed }) => confirmed && "Order confirmed", except: ["confirmed"] },
      { value: (_, { context }) => context.mode === "view" && "Read-only" },
    ],
  },
  outputs: ({ output }) => {
    const totals = output(({ total }, { context }) => ({
      gross: (total ?? 0) * (1 + context.currency.taxRate),
    }));
    const label = output(
      (_, { read, context }) => `${read(totals).gross} ${context.currency.code}`,
    );
    return { totals, label };
  },
  defaults: ({ today }) => ({ deliveryDate: today }),
  fields,
});
// The tools see the declared context, read-only in depth.
defineForm({
  context: declareContext<Mode>(),
  fields,
  rules: {
    total: {
      value: (_, { context }) => {
        const seen: Equal<typeof context, DeepReadonly<Mode>> = true;
        void seen;
        return null;
      },
    },
  },
});
// Context first, rules after it; outputs before context; defaults returns a subset.
defineForm({
  context: declareContext<Mode>(),
  fields,
  rules: { confirmed: { disabled: (_, { context }) => context.mode === "view" } },
});
defineForm({
  outputs: ({ output }) => ({ code: output((_, { context }) => context.currency.code) }),
  defaults: ({ mode, today }) => (mode === "create" ? { deliveryDate: today, total: 0 } : {}),
  context: declareContext<Mode>(),
  fields,
});
// The session requires the declared context, and takes it with other options.
const session = createSession(order, { context: ctx });
createSession(order, { context: ctx, initial: { title: "x" }, loader: undefined });
session.watchOutputs(({ totals, label }) => void [totals.gross satisfies number, label]);
const read: Equal<FormContext<typeof order>, Mode> = true;
void read;
// A form without context does not change: no context in tools or sessions.
const plain = defineForm({
  fields,
  rules: {
    title: {
      value: (_, { peek }) => (peek.confirmed ? "x" : undefined),
      onChange: (_, { toDefaults }) => toDefaults("title"),
    },
  },
  outputs: ({ output }) => ({ same: output((_, { read: r }) => typeof r) }),
});
createSession(plain);
createSession(plain, { context: undefined });
const none: Equal<FormContext<typeof plain>, undefined> = true;
void none;
// Explicit context: undefined is not declaring one; defaults: undefined too.
const explicit = defineForm({ fields, context: undefined, defaults: undefined });
createSession(explicit);
// The bound defineForm: async fields, params with context and defaults
// with a whole option.
declare const saved: Customer;
const remote = boundForm({
  context: declareContext<{ company: string; customer: Customer | null }>(),
  fields: {
    customer: bound.async("customers"),
    contact: bound.async("contacts"),
    note: field.text(),
  },
  rules: {
    contact: {
      params: ({ customer }, { context }) =>
        customer === null || context.company === "" ? undefined : { customer: customer.value },
    },
  },
  defaults: ({ customer }) => ({ customer: customer ?? saved, note: "" }),
});
createSession(remote, { scope: "acme", context: { company: "acme", customer: null } });
// Explicit type arguments work without context.
defineForm<typeof fields>({ fields, rules: { total: { value: () => 1 } } });
// The wide definition takes forms with and without context.
const wide: FormDefinition[] = [order, plain, remote];
void wide;
// A generic wrapper forwards a context of the form it opens.
const open = <D extends FormDefinition>(definition: D, options: { context: FormContext<D> }) =>
  createSession(definition, { scope: "acme", context: options.context });
open(order, { context: ctx });
open(plain, { context: undefined });

// ------------------------------------------------------------- negatives
// @ts-expect-error A Date is not plain data.
declareContext<{ today: Date }>();
interface Declared {
  mode: string;
}
// @ts-expect-error Limit: an interface has no implicit index signature.
declareContext<Declared>();
// @ts-expect-error The context is an object: not a string.
declareContext<string>();
// @ts-expect-error The context cannot be undefined.
declareContext<Mode | undefined>();
// @ts-expect-error context takes a type argument.
defineForm({ context: declareContext(), fields });
// @ts-expect-error never is not a context.
defineForm({ context: declareContext<never>(), fields });
// @ts-expect-error A form that declares a context requires the options.
createSession(order);
// @ts-expect-error The options must include the context.
createSession(order, { initial: { title: "x" } });
// @ts-expect-error The declared context cannot be undefined.
createSession(order, { context: undefined });
// @ts-expect-error A context of another type.
createSession(order, { context: { mode: "edit", today: "2026-09-27" } });
// @ts-expect-error A form without context takes none.
createSession(plain, { context: ctx });
defineForm({
  fields,
  // @ts-expect-error Without a context, value formulas have none.
  rules: { title: { value: (_, { context }) => String(context) } },
});
defineForm({
  fields,
  // @ts-expect-error State formulas have no context in this form.
  rules: { title: { hidden: (_, { context }) => context === undefined } },
});
defineForm({
  fields,
  // @ts-expect-error The form lock has no context in this form.
  form: { readOnly: { value: (_, { context }) => context === undefined } },
});
boundForm({
  fields: { contact: bound.async("contacts") },
  // @ts-expect-error params has no context in this form.
  rules: { contact: { params: (_, { context }) => ({ customer: Number(context) }) } },
});
defineForm({
  fields,
  // @ts-expect-error Events have no context in this form.
  rules: { title: { onChange: (_, { context }) => ({ title: String(context) }) } },
});
defineForm({
  fields,
  // @ts-expect-error Outputs have no context in this form.
  outputs: ({ output }) => ({ mode: output((_, { context }) => String(context)) }),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  rules: {
    title: {
      value: (_, { context }) => {
        // @ts-expect-error The context is read-only.
        context.mode = "view";
        // @ts-expect-error Nested context properties are read-only.
        context.currency.code = "USD";
        return "";
      },
    },
  },
});
defineForm({
  fields,
  // @ts-expect-error defaults require a context.
  defaults: () => ({ title: "x" }),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error The returned object literal contains an undeclared field.
  defaults: ({ today }) => ({ deliveryDate: today, delivery: today }),
});
const reused = { deliveryDate: "2026-09-27", delivery: "x" };
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error The reused object contains an undeclared field.
  defaults: () => reused,
});
const helper = (today: string) => ({ deliveryDate: today, delivery: today });
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error The helper returns an undeclared field.
  defaults: ({ today }) => helper(today),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error The spread includes an undeclared field.
  defaults: ({ today }) => ({ ...reused, deliveryDate: today }),
});
const pickDefaults = (on: boolean) => (on ? { title: "x" } : { titel: "x" });
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error A union of results keeps the key of each member.
  defaults: () => pickDefaults(enabled),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error A default must be a value of the field's type.
  defaults: () => ({ deliveryDate: 5 }),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error undefined is not a value.
  defaults: () => ({ deliveryDate: undefined }),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error A default cannot be a value that may be undefined.
  defaults: ({ mode, today }) => ({ deliveryDate: mode === "create" ? today : undefined }),
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error defaults are synchronous.
  defaults: async ({ today }) => {
    await Promise.resolve();
    return { deliveryDate: today };
  },
});
defineForm({
  context: declareContext<Mode>(),
  fields,
  // @ts-expect-error defaults return an object.
  defaults: () => 5,
});
// @ts-expect-error A context section that may be undefined declares none.
defineForm({
  context: enabled ? declareContext<Mode>() : undefined,
  fields,
  rules: { title: { hidden: (_, { context }) => context.mode === "view" } },
});
boundForm({
  context: declareContext<{ company: string }>(),
  fields: { customer: bound.async("customers") },
  // @ts-expect-error An async default is the whole option, not its value.
  defaults: () => ({ customer: 1 }),
});
// @ts-expect-error A form with async fields still requires a scope.
createSession(remote, { context: { company: "acme", customer: null } });
