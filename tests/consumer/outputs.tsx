import { createSession, defineForm, field } from "trama-forms/core";
import { OutputBoundary, useOutputs } from "trama-forms/react";

declare function uncheckedData(): unknown;

const task = defineForm({
  outputs: ({ output }) => {
    const total = output((values) => values.total);
    const data = output((values, { read }) => ({
      amount: read(total),
      status: values.status,
      rows: [{ title: values.title }],
      missing: undefined,
      bigint: 1n,
      symbol: Symbol.iterator,
    }));
    const caption = output((_, { read }) => {
      const current = read(data);
      // @ts-expect-error Deeply readonly even between formulas.
      current.rows[0].title = "Changed";
      // @ts-expect-error Nullability is preserved.
      read(total).toFixed(2);
      return `${current.amount} units`;
    });
    defineForm({
      fields: {
        total: field.number(),
        title: field.text(),
        status: field.select({ options: [{ value: "ready", label: "Ready" }] }),
      },
      outputs: ({ output: otherOutput }) => {
        // @ts-expect-error Ownership is invariant, including equal field schemas.
        otherOutput((_, { read }) => read(total));
        return {};
      },
    });
    defineForm({
      fields: {
        total: field.number(),
        title: field.text(),
        status: field.select({ options: [{ value: "ready", label: "Ready" }] }),
      },
      // @ts-expect-error Returning a foreign reference is also forbidden.
      outputs: () => ({ total }),
    });
    return { data, total, caption };
  },
  rules: {
    total: {
      value: (values, tools) => {
        // @ts-expect-error Rules cannot read outputs.
        void tools.read;
        // @ts-expect-error Rules cannot access outputs by name.
        void values.caption;
        return values.title.length;
      },
    },
  },
  fields: {
    total: field.number(),
    title: field.text(),
    status: field.select({ options: [{ value: "ready", label: "Ready" }] }),
  },
});
const session = createSession(task);
function Summary() {
  const { data, caption, ...rest } = useOutputs(session);
  const status: "ready" | null = data.status;
  const amount: number | null = rest.total;
  /* oxlint-disable react/immutability -- This fixture verifies a rejected mutation. */
  // @ts-expect-error The hook preserves readonly nested properties.
  data.rows[0].title = "Changed";
  /* oxlint-enable react/immutability */
  // @ts-expect-error The hook retains exact output names.
  void rest.absent;
  return (
    <output>
      {caption}
      {status}
      {amount}
    </output>
  );
}
const fallback = <p>Adjust the inputs.</p>;
function RecoveredSummary() {
  return (
    <OutputBoundary session={session} fallback={fallback}>
      <Summary />
    </OutputBoundary>
  );
}
void RecoveredSummary;
// @ts-expect-error A session is required, not the definition.
<OutputBoundary session={task} fallback={null} />;
// @ts-expect-error The fallback is required.
<OutputBoundary session={session} />;
// @ts-expect-error Recovery does not expose a manual retry option.
<OutputBoundary session={session} fallback={null} retry={() => {}} />;
session.watchOutputs(
  ({ data, total, caption }) => {
    const amount: number | null = total;
    const status: "ready" | null = data.status;
    const text: string = caption;
    // @ts-expect-error Deeply readonly to callers.
    data.rows[0].title = "Changed";
    // @ts-expect-error Exact chained result type.
    const wrong: string = data.amount;
    void [amount, status, text, wrong];
  },
  {
    onError: (error) => {
      const cause: unknown = error;
      void cause;
    },
  },
);
// @ts-expect-error Outputs retain their declared names.
session.watchOutputs(({ absent }) => void absent);
// @ts-expect-error Outputs are not field values.
void session.getSnapshot().values.caption;
// @ts-expect-error Field edit cannot target outputs.
session.edit("caption", "Changed");

defineForm({
  fields: {},
  outputs: ({ output }) => ({
    data: output(() => ({ empty: [], nil: null, optional: undefined, nan: NaN })),
  }),
});

defineForm({
  fields: { title: field.text() },
  outputs: ({ output }) => {
    // @ts-expect-error Async output formulas are outside the contract.
    output(async () => {
      await Promise.resolve();
      return 1;
    });
    // @ts-expect-error Dates are not plain output data.
    output(() => new Date());
    // @ts-expect-error Unknown results cannot establish the output domain.
    output(() => uncheckedData());
    // @ts-expect-error Invalid nested results are rejected.
    output(() => ({ nested: [new Map()] }));
    // @ts-expect-error Sets are not plain output data.
    output(() => new Set());
    // @ts-expect-error Functions are not results.
    output(() => () => 1);
    // @ts-expect-error Unions cannot hide unsupported results.
    output((values) => (values.title ? 1 : Promise.resolve(2)));
    return {};
  },
});
