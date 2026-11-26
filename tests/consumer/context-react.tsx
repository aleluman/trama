// useFormSession with context, from the installed package. Positives compile
// without casts; each negative fails for the reason its directive gives.
import { declareContext, defineForm, field } from "trama-forms/core";
import {
  createReactBinding,
  initialFromQuery,
  type AsyncFieldProps,
  type InitialQuery,
  type TextFieldProps,
} from "trama-forms/react";
import { defineForm as boundForm, field as bound } from "./async.js";

type Mode = { mode: "create" | "edit" | "view"; today: string };
const text = (props: TextFieldProps) => <span>{props.value}</span>;
const remoteInput = (props: AsyncFieldProps) => <span>{props.value?.label}</span>;
const ui = createReactBinding({ text, async: remoteInput });

const order = defineForm({
  context: declareContext<Mode>(),
  defaults: ({ today }) => ({ deliveryDate: today }),
  fields: { title: field.text(), deliveryDate: field.text() },
  form: { readOnly: { value: (_, { context }) => context.mode === "view" && "Read-only" } },
});
const remote = boundForm({
  fields: { customer: bound.async("customers"), note: field.text() },
  context: declareContext<{ company: string }>(),
  rules: { note: { hidden: (_, { context }) => context.company === "" } },
});
const plain = defineForm({ fields: { title: field.text() } });
declare const query: InitialQuery<{ title: string }>;

// ------------------------------------------------------------- positives
export function OrderEditor({ id, mode, today }: { id: string } & Mode) {
  const editor = ui.useFormSession(order, {
    key: id,
    initial: initialFromQuery(query),
    context: { mode, today },
  });
  if (editor.status !== "ready") return null;
  return <ui.Field session={editor.session} name="deliveryDate" />;
}
export function RemoteEditor({ company }: { company: string }) {
  const editor = ui.useFormSession(remote, { key: 1, scope: company, context: { company } });
  return editor.status === "ready" ? <ui.Field session={editor.session} name="customer" /> : null;
}
export function PlainEditor() {
  ui.useFormSession(plain);
  ui.useFormSession(plain, { key: 1, context: undefined });
  return null;
}

// ------------------------------------------------------------- negatives
export function Missing() {
  // @ts-expect-error A form that declares a context requires the options.
  ui.useFormSession(order);
  // @ts-expect-error The options must include the declared context.
  ui.useFormSession(order, { key: "1" });
  // @ts-expect-error The supplied context must match the declared type.
  ui.useFormSession(order, { context: { mode: "edit" } });
  // @ts-expect-error A form without context takes none.
  ui.useFormSession(plain, { context: { mode: "edit", today: "" } });
  // @ts-expect-error scope is still required with async fields.
  ui.useFormSession(remote, { context: { company: "acme" } });
  return null;
}
// A read-only context is accepted, as in createSession: readonly arrays too.
type Tagged = { mode: "edit" | "view"; tags: string[] };
const tagged = defineForm({ context: declareContext<Tagged>(), fields: { title: field.text() } });
const readonlyTags: readonly string[] = ["vip"];
export function Readonly() {
  ui.useFormSession(tagged, { context: { mode: "view", tags: readonlyTags } });
  return null;
}
