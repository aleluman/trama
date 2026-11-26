// touch and the pending input of a view, inferred without annotations: the
// names a session and a row take, the controller of a view, and the marks the
// snapshots publish.
import {
  createSession,
  defineForm,
  field,
  type FormDefinition,
  type Session,
} from "trama-forms/core";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const trip = defineForm({
  fields: { since: field.date({ required: true }), note: field.text() },
  collections: { legs: { fields: { day: field.date(), stop: field.text() } } },
});
const session = createSession(trip);

session.touch("since");
// @ts-expect-error A collection is not a field to touch.
session.touch("legs");
// @ts-expect-error touch takes a field of the header.
session.touch("absent");

const view = session.input("since");
view.error("Incomplete date");
// oxlint-disable-next-line unicorn/no-useless-undefined -- An explicit undefined withdraws it too.
view.error(undefined);
view.error();
view.dispose();
// @ts-expect-error A message is a text.
view.error(3);
// @ts-expect-error input takes a field of the header.
session.input("day");
export const controller: Equal<
  typeof view,
  { error(message?: string | undefined): void; dispose(): void }
> = true;

const [key] = session.getSnapshot().rows.legs;
if (key !== undefined) {
  const leg = session.row("legs", key);
  leg.touch();
  leg.touch("day");
  // @ts-expect-error A cell of the row.
  leg.touch("since");
  leg.input("stop").error("Incomplete stop");
  // @ts-expect-error A cell of the row.
  leg.input("note");
  const rowTouched: boolean | undefined = leg.getSnapshot()?.touched;
  void rowTouched;
}

// The marks of the snapshots.
const snapshot = session.getSnapshot();
export const touched: Equal<typeof snapshot.fieldStates.since.touched, boolean> = true;
export const pending: Equal<typeof snapshot.form.inputPending, boolean> = true;
export const cell: Equal<(typeof snapshot.fieldStates.legs)[number]["day"]["touched"], boolean> =
  true;

// A helper over any session touches by name and reports by name.
export const touchAll = (any: Session<FormDefinition>, names: readonly string[]) => {
  for (const name of names) any.touch(name);
  return names.map((name) => any.input(name));
};
touchAll(session, ["since"]);
