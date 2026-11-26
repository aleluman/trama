// The async renderer, the binding options, useFormSession with scope and
// queryLoader with a real QueryClient, from the installed package.
import { QueryClient } from "@tanstack/react-query";
import { createSession, defineForm, field, type Loader, type Option } from "trama-forms/core";
import {
  createReactBinding,
  queryLoader,
  type AsyncFieldProps,
  type BindingOptions,
  type CheckboxFieldProps,
  type NumberFieldProps,
  type OptionListProps,
  type QueryClientLike,
  type SelectFieldProps,
  type TextFieldProps,
} from "trama-forms/react";
import { defineForm as boundForm, field as bound, order, type Customer } from "./async.js";

const plainForm = defineForm({ fields: { note: field.text() } });
const text = (props: TextFieldProps) => <span>{props.value}</span>;
const number = (props: NumberFieldProps) => <span>{props.value}</span>;
const checkbox = (props: CheckboxFieldProps) => <span>{String(props.value)}</span>;
const select = (props: SelectFieldProps) => <span>{props.value}</span>;
// One renderer serves every endpoint: it sees the base option and the list.
const AsyncInput = ({ value, placeholder, list }: AsyncFieldProps) => {
  const { status, text: search, options, complete, error } = list;
  void [status, complete, error?.message];
  return (
    <div>
      <input placeholder={placeholder} value={value?.label ?? search} readOnly />
      <button onClick={list.open}>Open</button>
      <button onClick={list.more}>More</button>
      <button onClick={list.retry}>Retry</button>
      {options.map((option) => (
        <span key={option.value}>{option.label}</span>
      ))}
    </div>
  );
};
// It writes whole options, or null, and searches with text.
const choose = ({ list, onChange }: AsyncFieldProps) => {
  onChange(list.options[0] ?? null);
  list.search(list.text);
};
void choose;
// The list of a renderer is its snapshot with the actions.
const listProps = (props: AsyncFieldProps<Customer>): OptionListProps<Customer> => props.list;
void (listProps satisfies (props: AsyncFieldProps<Customer>) => { readonly text: string });

// A real QueryClient fits QueryClientLike without a cast, and queryLoader gives a Loader.
const queryClient = new QueryClient();
const like: QueryClientLike = queryClient;
const loader: Loader = queryLoader(like);
const options: BindingOptions = { loader };
const ui = createReactBinding({ text, number, checkbox, select, async: AsyncInput }, options);
createReactBinding({ text, async: AsyncInput }, { loader: queryLoader(queryClient) });
createReactBinding({ text }, { loader: undefined });
createReactBinding({ text }, {});

export function OrderEditor({ id, company }: { id: string; company: string }) {
  // useFormSession requires a scope with async fields.
  const editor = ui.useFormSession(order, { key: id, scope: company });
  if (editor.status !== "ready") return null;
  return (
    <>
      <ui.Field session={editor.session} name="customer" placeholder="Search for a customer" />
      <ui.Field session={editor.session} name="contact" label="Contact" />
      <ui.Field session={editor.session} name="note" />
    </>
  );
}
export function PlainEditor() {
  // A form without async fields needs no scope.
  const editor = ui.useFormSession(plainForm);
  return editor.status === "ready" ? <ui.Field session={editor.session} name="note" /> : null;
}
// Field renders the element of a registered renderer, the async one included.
declare const rendered: NonNullable<ReturnType<typeof ui.Field>>;
void (rendered.props.value satisfies string | number | boolean | Option | null);

export function MissingScope() {
  // @ts-expect-error useFormSession requires a scope with async fields.
  ui.useFormSession(order, { key: "1" });
  // @ts-expect-error Also when no options are given.
  ui.useFormSession(order);
  return null;
}
export function Uncovered() {
  // @ts-expect-error A binding without an async renderer does not cover the form.
  createReactBinding({ text, number, checkbox, select }).useFormSession(order, { scope: 1 });
  return null;
}
const session = createSession(order, { scope: "acme" });
// @ts-expect-error Field cannot replace the list or pass static options.
void (<ui.Field session={session} name="customer" options={[]} />);
// @ts-expect-error A renderer for the options of one endpoint cannot serve every endpoint.
createReactBinding({ async: (props: AsyncFieldProps<Customer>) => props.value?.deliveryHint });
// @ts-expect-error The binding options take a loader only.
createReactBinding({ text }, { cache: true });
// @ts-expect-error A loader is a function of the key, run and options.
createReactBinding({ text }, { loader: queryClient });
// @ts-expect-error queryLoader takes a client with fetchQuery.
queryLoader({});

const picked = boundForm({ fields: { picked: bound.async("customers") } });
export function EitherForm() {
  const either = Math.random() < 2 ? picked : plainForm;
  // @ts-expect-error scope is required when a member of the union has async fields.
  ui.useFormSession(either);
  ui.useFormSession(either, { scope: 1 });
  return null;
}
