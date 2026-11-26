// The modules of the application using the installed package for touch and the pending input of a
// view, which package-submit.mjs lists with those of prepare and commit.

// A session whose views report input and touch fields, cells and rows, which
// the declarations name without a path of the package.
export const viewed = `
import { createSession, defineForm, field } from "trama-forms/core";
export const trip = defineForm({
  fields: { since: field.date({ required: true }) },
  collections: { legs: { fields: { day: field.date() } } },
});
export const tripSession = createSession(trip, { initial: { legs: [{}] } });
export const sinceView = tripSession.input("since");
export const touchSince = () => tripSession.touch("since");
export const firstLeg = () => {
  const [key] = tripSession.getSnapshot().rows.legs;
  return key === undefined ? undefined : tripSession.row("legs", key);
};
`;

// A module that reports and touches through the emitted declarations.
export const reviewed = `
import { firstLeg, sinceView, touchSince, tripSession } from "./declarations/viewed.js";
sinceView.error("Incomplete date");
sinceView.error();
sinceView.dispose();
touchSince();
const leg = firstLeg();
leg?.touch();
leg?.touch("day");
leg?.input("day").error("Incomplete day");
const pending: boolean = tripSession.getSnapshot().form.inputPending;
const touched: boolean = tripSession.getSnapshot().fieldStates.since.touched;
const rowTouched: boolean | undefined = leg?.getSnapshot()?.touched;
// @ts-expect-error A message is a text.
sinceView.error(3);
// @ts-expect-error touch takes a field of the header.
tripSession.touch("legs");
void [pending, touched, rowTouched];
`;

// A binding that shows errors after the attempt, exported whole and
// destructured, whose renderer reports input and touches.
export const viewedUi = `
import { createElement } from "react";
import { createReactBinding, type DateFieldProps } from "trama-forms/react";
const DateText = ({ id, errors, onBlur, onInputError }: DateFieldProps) =>
  createElement("input", { id, "aria-invalid": errors.length > 0, onBlur, onInput: () => onInputError("Incomplete") });
export const ui = createReactBinding({ date: DateText }, { showErrors: "attempted" });
export const { Field, useFormState } = ui;
`;

// A module that reads the state of each scope with the emitted hook.
export const reviewedUi = `
import { ui, useFormState } from "./declarations/viewed-ui.js";
import { firstLeg, tripSession } from "./declarations/viewed.js";
const leg = firstLeg();
export const Summary = () => {
  const form = useFormState(tripSession);
  const legs = ui.useFormState(tripSession, "legs");
  const row = leg === undefined ? undefined : leg.getSnapshot();
  const pending: boolean = form.inputPending;
  const count: number = legs.errorCount;
  // @ts-expect-error A collection of the form.
  useFormState(tripSession, "absent");
  void [pending, count, row];
  return null;
};
`;
