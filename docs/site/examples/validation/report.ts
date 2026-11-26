import { createForms, createSession } from "trama-forms/core";

// The application defines its validation messages once.
const { defineForm, field } = createForms({
  endpoints: [],
  messages: {
    required: ({ label }) => `${label ?? "This field"} is required`,
    min: ({ min }) => `No earlier than ${min}`,
  },
});
const kinds = [
  { value: "sale", label: "Sale" },
  { value: "quote", label: "Quote" },
];

// A report. The period is required, “To” must be on or after “From”, and
// either types or IDs are required.
const report = defineForm({
  fields: {
    since: field.date({ label: "From", required: "Choose the period" }),
    until: field.date({ label: "To", required: true }),
    kinds: field.multiSelect({ label: "Types", options: kinds }),
    ids: field.text({ label: "IDs" }),
  },
  rules: {
    until: { min: ({ since }) => since },
    kinds: {
      required: ({ ids }) => ids === "" && "Choose a type or enter IDs",
      disabled: ({ ids }) => ids !== "" && "You already entered IDs",
    },
  },
  form: {
    warning: ({ since, until }) =>
      since !== null &&
      until !== null &&
      since.slice(0, 4) !== until.slice(0, 4) &&
      "The period crosses a year boundary",
  },
});

export const run = (log: (label: string, value: unknown) => void) => {
  const session = createSession(report);
  const show = (label: string) => {
    const { fieldStates, form } = session.getSnapshot();
    log(label, {
      since: fieldStates.since.errors,
      until: fieldStates.until.errors,
      kinds: fieldStates.kinds.errors,
      form: { errorCount: form.errorCount, warnings: form.warnings },
    });
  };
  show("on opening");
  session.edit("since", "2026-03-10");
  session.edit("until", "2026-03-01");
  show("“To” before “From”");
  log("the value stays the same", session.getSnapshot().values.until);
  session.edit("until", "2027-01-15");
  show("a period that crosses a year boundary");
  session.edit("ids", "17, 21");
  show("with IDs");
};
