// setErrors and setWarnings, inferred without annotations: the response of a
// server translated with a map, the keys of the prepared, the names of the
// definition in each issue, and what each scope reads of its externals.
import {
  createSession,
  defineForm,
  field,
  type FormDefinition,
  type Issue,
  type RowKey,
  type Session,
} from "trama-forms/core";

const voucher = defineForm({
  fields: { date: field.date(), number: field.number() },
  collections: {
    lines: { fields: { amount: field.number(), memo: field.text() } },
    taxes: { fields: { code: field.text() } },
  },
});
const session = createSession(voucher, { initial: { lines: [{}], taxes: [{}] } });

// What a server rejects: a line by its index, with its column, or a parameter.
type Rejection = {
  readonly lines: readonly {
    readonly line: number;
    readonly column: "amount" | "memo";
    readonly message: string;
  }[];
  readonly params: readonly { readonly name: "date" | "number"; readonly message: string }[];
  readonly general: readonly string[];
};
declare const reply: Rejection;

export const sent = await session.prepare();
if (sent.status === "ready") {
  // The translator is a map: the index of a line is the key of the prepared.
  const accepted: boolean = session.setErrors(
    "server",
    reply.lines.map((rejected) => ({
      collection: "lines",
      key: sent.rows.lines[rejected.line],
      field: rejected.column,
      message: rejected.message,
    })),
    { from: sent },
  );
  session.setErrors(
    "params",
    reply.params.map(({ name, message }) => ({ field: name, message })),
    { from: sent },
  );
  session.setWarnings(
    "server",
    reply.general.map((message) => ({ message })),
    { from: sent },
  );
  void accepted;
}

// Every place, written in the call, and a list annotated with its form.
const [line] = session.getSnapshot().rows.lines;
const [tax] = session.getSnapshot().rows.taxes;
session.setErrors("server", [
  { message: "General" },
  { field: "date", message: "Date" },
  { collection: "lines", message: "Lines" },
  { collection: "lines", key: line, message: "Line" },
  { collection: "lines", key: line, field: "amount", message: "Amount" },
  { collection: "taxes", key: tax, field: "code", message: "Code" },
]);
const annotated: Issue<typeof voucher>[] = [
  { field: "number", message: "Number" },
  { collection: "lines", key: line, message: "Line" },
];
session.setWarnings("server", annotated);
session.setErrors("server", []);
// A column computed from the reply.
const column: "amount" | "memo" = reply.lines[0]?.column ?? "memo";
session.setErrors("server", [{ collection: "lines", key: line, field: column, message: "x" }]);

// @ts-expect-error A field of the header that does not exist.
session.setErrors("server", [{ field: "nmber", message: "x" }]);
// @ts-expect-error A collection is not a field of the header.
session.setErrors("server", [{ field: "lines", message: "x" }]);
// @ts-expect-error A collection that does not exist.
session.setErrors("server", [{ collection: "lined", message: "x" }]);
// @ts-expect-error A column that does not exist.
session.setErrors("server", [{ collection: "lines", key: line, field: "amont", message: "x" }]);
// @ts-expect-error A column of another collection.
session.setErrors("server", [{ collection: "lines", key: line, field: "code", message: "x" }]);
// @ts-expect-error A cell needs the key of its row.
session.setErrors("server", [{ collection: "lines", field: "amount", message: "x" }]);
// @ts-expect-error The key of a row of another collection.
session.setErrors("server", [{ collection: "lines", key: tax, message: "x" }]);
// @ts-expect-error A key is not any text.
session.setErrors("server", [{ collection: "lines", key: "r1", message: "x" }]);
// @ts-expect-error A key needs its collection.
session.setErrors("server", [{ key: line, message: "x" }]);
// @ts-expect-error An issue has a message.
session.setErrors("server", [{ field: "date" }]);
// @ts-expect-error issue property "path" does not exist
session.setErrors("server", [{ field: "date", message: "x", path: "a.b" }]);
// A reused object escapes the excess property check, and is checked again.
const reused = { field: "date", message: "x", path: "a.b" } as const;
// @ts-expect-error issue property "path" does not exist
session.setErrors("server", [reused]);
// @ts-expect-error issue property "path" does not exist
session.setWarnings("server", [{ message: "x" }, reused]);
// @ts-expect-error The source is a text.
session.setErrors(3, []);
// @ts-expect-error The options take only from.
session.setErrors("server", [], { form: sent });
// @ts-expect-error from is a prepared, not any outcome.
session.setErrors("server", [], { from: sent });
// A prepared of a form whose values differ is not one of this one.
const other = createSession(defineForm({ fields: { note: field.text() } }));
const elsewhere = await other.prepare();
// @ts-expect-error A prepared of a definition whose values differ.
if (elsewhere.status === "ready") session.setErrors("server", [], { from: elsewhere });

// What each scope reads: its external errors apart, its warnings joined.
const snapshot = session.getSnapshot();
const ofField: readonly string[] = snapshot.fieldStates.date.externalErrors;
const ofForm: readonly string[] = snapshot.form.externalErrors;
const ofLines: readonly string[] = snapshot.form.collections.lines.externalErrors;
const ofRow: readonly string[] | undefined =
  line && session.row("lines", line).getSnapshot()?.externalErrors;
const ofCell: readonly string[] | undefined = snapshot.fieldStates.lines[0]?.amount.externalErrors;
void [ofField, ofForm, ofLines, ofRow, ofCell];
// @ts-expect-error The external warnings are among the warnings.
void snapshot.form.externalWarnings;

// A helper over the wide session takes issues with any names, as prepare
// gives them, and a list of a form is one of them.
export const reject = (wide: Session<FormDefinition>, issues: readonly Issue[]) =>
  wide.setErrors("server", issues);
export const rejected: boolean = reject(session, annotated);
const wideKey: RowKey | undefined = annotated[0]?.key;
void wideKey;
