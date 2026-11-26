import { createSession, defineForm, field } from "trama-forms/core";
import { createReactBinding, OutputBoundary, useOutputs } from "trama-forms/react";
import { order, type OrderContext } from "../docs/site/examples/complete/order.ts";
// The guide's complete example is compiled against the installed declarations too.
const session = createSession(order, {
  ...orderOptions(),
  initial: { total: null, country: "ES", includeNote: false },
});
session.edit("country", "JP");
session.edit("total", null);
session.getSnapshot().fieldStates.note.disabled satisfies boolean;
session.getSnapshot().values.country satisfies "ES" | "MX" | "JP" | null;
// @ts-expect-error Null remains part of the inferred field domain.
session.getSnapshot().values.total.toFixed(2);
// @ts-expect-error The literal options remain closed in the combined definition.
session.edit("country", "unknown");
// @ts-expect-error Outputs are not fields.
session.edit("caption", "changed");
session.watchOutputs(({ totals, caption, unitPrice, unitCaption }) => {
  totals.gross satisfies number;
  caption satisfies string;
  unitPrice satisfies number;
  unitCaption satisfies string;
  // @ts-expect-error Nested output data remains protected.
  totals.net = 0;
});

const ui = createReactBinding({
  text: ({ value, disabled, onChange }) => {
    onChange(value);
    return <input aria-label="Note" value={value} disabled={disabled} readOnly />;
  },
  number: ({ value, disabled, onChange }) => {
    onChange(null);
    return <input aria-label="Total" value={value ?? ""} disabled={disabled} readOnly />;
  },
  checkbox: ({ value, disabled, onChange }) => {
    onChange(value);
    return (
      <input
        aria-label="Include note"
        type="checkbox"
        checked={value}
        disabled={disabled}
        readOnly
      />
    );
  },
  select: ({ value, disabled, options, onChange }) => {
    onChange(options[0]?.value ?? null);
    return <select aria-label="Country" defaultValue={value ?? ""} disabled={disabled} />;
  },
  async: ({ value, list }) => <output>{value?.label ?? list.text}</output>,
});
function Editor() {
  const editor = ui.useFormSession(order, orderOptions());
  if (editor.status !== "ready") return null;
  return (
    <>
      <ui.Field session={editor.session} name="note" />
      <ui.Field session={editor.session} name="country" />
    </>
  );
}
function Summary() {
  const { totals, caption, unitCaption } = useOutputs(session);
  totals.tax satisfies number;
  return (
    <output>
      {caption}
      {unitCaption}
      {totals.gross}
    </output>
  );
}
void (
  <>
    <Editor />
    <OutputBoundary session={session} fallback={<p>Unavailable</p>}>
      <Summary />
    </OutputBoundary>
  </>
);
// @ts-expect-error JSX uses the same exact names as the combined session.
void (<ui.Field session={session} name="unitCaption" />);

// All sections together in the opposite order, with reusable entries and empty arrays.
const reusable = { disabled: () => true };
const clear = { onChange: () => ({ status: null }) };
const reversed = defineForm({
  rules: {
    total: { value: ({ quantity }) => (quantity ?? 0) * 10 },
    status: { value: () => "ready" },
    note: reusable,
    quantity: { ...clear, disabled: [] },
  },
  outputs: ({ output }) => {
    const nullable = output((values) => ({ total: values.total, status: values.status }));
    const caption = output((_, { read }) => {
      const data = read(nullable);
      data.total satisfies number | null;
      data.status satisfies "ready" | null;
      return `${data.total ?? 0}: ${data.status ?? "empty"}`;
    });
    return { nullable, caption };
  },
  fields: {
    quantity: field.number(),
    total: field.number(),
    note: field.text(),
    status: field.select({ options: [{ value: "ready", label: "Ready" }] }),
  },
});
createSession(reversed).watchOutputs(({ nullable, caption }) => {
  nullable.status satisfies "ready" | null;
  nullable.total satisfies number | null;
  caption satisfies string;
});

// The customer is the whole option of its endpoint, with the metadata the rules read.
const customer = session.getSnapshot().values.customer;
customer?.deliveryHint satisfies string | undefined;
customer?.defaultContact?.email satisfies string | undefined;
session.edit("customer", customer);
session.list("contact").getSnapshot().options[0]?.email satisfies string | undefined;
// @ts-expect-error The customer takes the whole option, not its value.
session.edit("customer", 1);
// @ts-expect-error Only async fields have an option list.
session.list("note");
// @ts-expect-error The order has async fields, so its sessions require a scope.
createSession(order);
export function MissingScope() {
  // @ts-expect-error useFormSession requires the scope too.
  ui.useFormSession(order, { context: orderOptions().context });
  return null;
}
// The scope and the context of every session of the order, declared last so no
// line above moves.
function orderOptions(): { scope: string; context: OrderContext } {
  const currency = { code: "JPY", taxRate: 0.2 };
  return { scope: "demo", context: { mode: "edit", today: "2026-09-27", currency } };
}
// @ts-expect-error With its context, the order still requires a scope.
createSession(order, { context: orderOptions().context });
