// ui.useFormState, inferred without annotations: the form of a session, one of
// its collections and a row, each with its own state, and a removed row.
import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding } from "trama-forms/react";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Scope = {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly dirty: boolean;
};
type Flat<T> = { [K in keyof T]: T[K] };

const ledger = defineForm({
  fields: { title: field.text() },
  collections: { lines: { fields: { amount: field.number() } } },
});
const session = createSession(ledger, { initial: { lines: [{}] } });
const { useFormState } = createReactBinding({});
const [key] = session.getSnapshot().rows.lines;
const handle = session.row("lines", key as NonNullable<typeof key>);

export const Summary = () => {
  const form = useFormState(session);
  const lines = useFormState(session, "lines");
  const row = useFormState(handle);
  const formIs: Equal<
    Flat<typeof form>,
    Flat<Scope & { readonly attempted: boolean; readonly inputPending: boolean }>
  > = true;
  const linesIs: Equal<Flat<typeof lines>, Flat<Scope>> = true;
  const rowIs: Equal<
    Flat<NonNullable<typeof row>>,
    Flat<Scope & { readonly attempted: boolean; readonly touched: boolean }>
  > = true;
  // A removed row gives undefined.
  const removed: undefined extends typeof row ? true : false = true;
  void [formIs, linesIs, rowIs, removed];
  return <p>{form.errorCount}</p>;
};

export const Wrong = () => {
  // @ts-expect-error A collection of the form.
  useFormState(session, "absent");
  // @ts-expect-error A row has no collection argument.
  useFormState(handle, "lines");
  return null;
};
