import { createSession, defineForm, field, type FormValues } from "trama-forms/core";
import {
  createReactBinding,
  initialFromQuery,
  type TextFieldProps,
  type NumberFieldProps,
  type CheckboxFieldProps,
  type SelectFieldProps,
} from "trama-forms/react";
import { skipToken, useQuery } from "@tanstack/react-query";

const task = defineForm({
  fields: {
    title: field.text({ label: "Title" }),
    estimate: field.number({ default: 0 }),
    done: field.checkbox(),
    status: field.select({
      options: [
        { value: "draft", label: "Draft" },
        { value: "ready", label: "Ready" },
      ],
      default: "draft",
    }),
    priority: field.select({
      options: [
        { value: 0, label: "Zero" },
        { value: 1, label: "One" },
      ],
    }),
  },
});
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const inferred: Equal<
  FormValues<typeof task>,
  {
    title: string;
    estimate: number | null;
    done: boolean;
    status: "draft" | "ready" | null;
    priority: 0 | 1 | null;
  }
> = true;
void inferred;
const text = (props: TextFieldProps) => {
  return <span>{props.value}</span>;
};
const number = (props: NumberFieldProps) => {
  return <span>{props.value}</span>;
};
const checkbox = (props: CheckboxFieldProps) => {
  return <span>{String(props.value)}</span>;
};
const select = (props: SelectFieldProps) => {
  return <span>{props.value}</span>;
};
const { Field, useFormSession } = createReactBinding({ text, number, checkbox, select });
const session = createSession(task, {
  initial: { title: "Review", estimate: null, status: "ready", priority: 0 },
});
session.edit("estimate", 0);
session.edit("estimate", null);
session.edit("status", null);
const plain = defineForm({ fields: { name: field.text() } });
createReactBinding({ text }).useFormSession(plain);
const view = <Field session={session} name="title" label="Local" placeholder="Override" />;
void view;
export function Editor({ id }: { id?: string }) {
  const query = useQuery({
    queryKey: ["task", id],
    queryFn: id === undefined ? skipToken : () => Promise.resolve({ name: id }),
    select: (data) => ({ title: data.name }),
    staleTime: 30_000,
  });
  const editor = useFormSession(task, {
    key: id,
    initial: id === undefined ? undefined : initialFromQuery(query),
  });
  if (editor.status === "loading") {
    // @ts-expect-error A loading editor has no editable session.
    void editor.session;
    return null;
  }
  if (editor.status === "error") {
    editor.retry();
    return null;
  }
  return <Field session={editor.session} name="status" />;
}
// @ts-expect-error A default cannot change the domain of a text field.
field.text({ default: 1 });
// @ts-expect-error A number default must be a number or null.
field.number({ default: "0" });
// @ts-expect-error A checkbox default must be boolean.
field.checkbox({ default: null });
// @ts-expect-error The default must belong to the inferred options.
field.select({ options: [{ value: "a", label: "A" }], default: "b" });
// @ts-expect-error A select option must have a string or numeric value.
field.select({ options: [{ value: true, label: "Invalid" }] });
// @ts-expect-error Unknown field names are rejected.
session.edit("missing", "x");
// @ts-expect-error Text does not accept null.
session.edit("title", null);
// @ts-expect-error Number editing does not coerce text.
session.edit("estimate", "1");
// @ts-expect-error Static option domains remain inferred.
session.edit("status", "unknown");
// @ts-expect-error Numeric options remain literals.
session.edit("priority", 2);
// @ts-expect-error Initial values use the inferred field domains.
createSession(task, { initial: { done: "true" } });
// @ts-expect-error Initial values cannot introduce fields.
createSession(task, { initial: { missing: 1 } });
// @ts-expect-error Only defineForm creates definitions.
createSession({ fields: { title: field.text() } });
// @ts-expect-error Renderer props preserve their value channel.
createReactBinding({ text: number });
// @ts-expect-error A renderer for a single select domain cannot cover every definition.
createReactBinding({ select: (props: SelectFieldProps<"draft">) => <span>{props.value}</span> });
// @ts-expect-error Opening checks every type, including invisible fields.
createReactBinding({ text }).useFormSession(task);
const PartialField = createReactBinding({ text }).Field;
// @ts-expect-error Connecting a core session also checks full coverage.
const absent = <PartialField session={session} name="title" />;
void absent;
// @ts-expect-error JSX names must belong to the session definition.
const unknown = <Field session={session} name="missing" />;
void unknown;
// @ts-expect-error Overrides cannot replace the value.
const valueOverride = <Field session={session} name="title" value="Injected" />;
void valueOverride;
// @ts-expect-error Overrides cannot replace the type.
const typeOverride = <Field session={session} name="title" type="number" />;
void typeOverride;
// @ts-expect-error Overrides cannot replace options.
const optionsOverride = <Field session={session} name="status" options={[]} />;
void optionsOverride;
// @ts-expect-error Checkbox does not support a placeholder.
const placeholder = <Field session={session} name="done" placeholder="Invalid" />;
void placeholder;
export function InvalidInitialEditor() {
  // @ts-expect-error Keys are scalar identities.
  useFormSession(task, { key: {} });
  // @ts-expect-error Synchronous initial values preserve field types.
  useFormSession(task, { initial: { title: false } });
  return null;
}
export function WrongQuery() {
  const query = useQuery({ queryKey: ["wrong"], queryFn: () => Promise.resolve({ title: 42 }) });
  // @ts-expect-error Query's selected values must fit the definition.
  useFormSession(task, { initial: initialFromQuery(query) });
  return null;
}

const uncertainRegistry: { text?: typeof text } = {};
export function UncertainEditor() {
  // @ts-expect-error Optional registration does not guarantee coverage of text fields.
  createReactBinding(uncertainRegistry).useFormSession(plain);
  return null;
}
// @ts-expect-error Unknown registry entries have no renderer contract.
createReactBinding({ text, unknown: text });
// @ts-expect-error Presentation cannot replace the edit channel.
const changeOverride = <Field session={session} name="title" onChange={text} />;
void changeOverride;

const calculated = defineForm({
  rules: {
    total: {
      value: (values) => {
        const quantity: Equal<typeof values.quantity, number | null> = true;
        const status: Equal<typeof values.status, "draft" | "ready" | null> = true;
        void quantity;
        void status;
        // @ts-expect-error Formula values are readonly.
        values.quantity = 1;
        // @ts-expect-error Only current fields are available.
        void values.missing;
        return (values.quantity ?? 0) * (values.price ?? 0);
      },
    },
  },
  fields: {
    quantity: field.number(),
    price: field.number(),
    total: field.number(),
    status: field.select({
      options: [
        { value: "draft", label: "Draft" },
        { value: "ready", label: "Ready" },
      ],
    }),
  },
});
createSession(calculated).edit("total", 25);
defineForm({
  fields: { text: field.text(), amount: field.number() },
  // @ts-expect-error Nullable numbers cannot flow into nonnullable text.
  rules: { text: { value: ({ amount }) => amount } },
});
// @ts-expect-error Explicit undefined initial values are invalid.
createSession(calculated, { initial: { total: undefined } });
