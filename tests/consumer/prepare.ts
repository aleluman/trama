// prepare and commit, inferred without annotations: forPrepare in queries, the
// outcomes of prepare, the prepared that only prepare gives, and the canonical
// values of commit, checked as a patch.
import {
  createForms,
  createSession,
  defineEndpoints,
  endpoint,
  type FormDefinition,
  type Issue,
  type Prepared,
  type RowKey,
  type Session,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const server = defineEndpoints({
  rate: endpoint.value((_, { date }: { date: string }) => Promise.resolve(date.length)),
});
const { defineForm, field } = createForms({ endpoints: [server] });

export const voucher = defineForm({
  fields: { date: field.date(), rate: field.number(), number: field.number() },
  collections: { lines: { fields: { amount: field.number(), rate: field.number() } } },
  rules: {
    rate: {
      query: {
        endpoint: "rate",
        params: ({ date }) => (date === null ? undefined : { date }),
        forPrepare: true,
      },
    },
    lines: {
      each: {
        rate: {
          query: {
            endpoint: "rate",
            params: (_, { values }) => (values.date === null ? undefined : { date: values.date }),
            forPrepare: false,
          },
        },
      },
    },
  },
});
defineForm({
  fields: { date: field.date(), rate: field.number() },
  // @ts-expect-error forPrepare is a boolean
  rules: { rate: { query: { endpoint: "rate", params: () => ({ date: "" }), forPrepare: 1 } } },
});
defineForm({
  fields: { date: field.date(), rate: field.number() },
  rules: {
    // @ts-expect-error query property "forPrepar" does not exist
    rate: { query: { endpoint: "rate", params: () => ({ date: "" }), forPrepar: true } },
  },
});

const session = createSession(voucher, { scope: "acme" });
export const outcome = await session.prepare({ signal: new AbortController().signal });
if (outcome.status === "ready") {
  const number: number | null = outcome.values.number;
  const keys: readonly RowKey<"lines">[] = outcome.rows.lines;
  const where: Issue | undefined = outcome.warnings[0];
  const place: string | undefined = where?.field;
  void [number, keys, place];
  const sent: Prepared<typeof voucher> = outcome;
  // The canonical values are a patch of the form.
  const accepted: boolean = session.commit(sent, { number: 7 });
  session.commit(sent, { lines: { [keys[0] as RowKey<"lines">]: { amount: 3 } } });
  // @ts-expect-error patch field "nmber" does not exist
  session.commit(sent, { nmber: 7 });
  // @ts-expect-error The value of number is a number.
  session.commit(sent, { number: "7" });
  void accepted;
} else if (outcome.status === "invalid") {
  const issues: readonly Issue[] = outcome.issues;
  void issues;
} else {
  const cancelled: Equal<typeof outcome, { readonly status: "cancelled" }> = true;
  void cancelled;
}
// prepare takes only a signal.
// @ts-expect-error signal is an AbortSignal
void session.prepare({ signal: 5 });

// Only prepare gives a prepared: an object written by hand lacks its mark.
const written = {
  status: "ready",
  values: session.getSnapshot().values,
  rows: session.getSnapshot().rows,
  warnings: [],
} as const;
// @ts-expect-error A prepared has a mark that only prepare gives.
session.commit(written);
// A prepared of a form whose values differ is not one of this one. One of a
// form with the same fields or more compiles, since Session is covariant, and
// commit rejects it at run time.
const other = createSession(defineForm({ fields: { note: field.text() } }));
const elsewhere = await other.prepare();
// @ts-expect-error A prepared of a definition whose values differ.
if (elsewhere.status === "ready") session.commit(elsewhere);

// The marks of the attempt, of the form and of a row.
export const attempted: boolean = session.getSnapshot().form.attempted;
const [line] = session.getSnapshot().rows.lines;
if (line !== undefined) {
  const row: boolean | undefined = session.row("lines", line).getSnapshot()?.attempted;
  void row;
}

// A helper over the wide session prepares any of them.
export const save = async (wide: Session<FormDefinition>) => {
  const sent = await wide.prepare();
  return sent.status === "ready" && wide.commit(sent);
};
export const saved = await save(session);
