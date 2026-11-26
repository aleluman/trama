import { createSession, defineForm, field } from "trama-forms/core";

// 1. The definition describes the fields. It stores no values.
const contact = defineForm({
  fields: {
    name: field.text({ label: "Name" }),
    age: field.number({ label: "Age" }),
    newsletter: field.checkbox({ label: "Receive updates", default: true }),
  },
});

// log() writes to the output panel in this guide.
export const run = (log: (label: string, value: unknown) => void) => {
  // 2. A session stores the values of a particular edit.
  const session = createSession(contact, { initial: { name: "Ana" } });
  log("on opening", session.getSnapshot().values);

  // 3. edit validates the value, applies it, and publishes a new snapshot.
  session.edit("age", 34);
  session.edit("newsletter", false);
  log("after editing", session.getSnapshot().values);

  // 4. reset restores the values the session opened with.
  session.reset();
  log("after reset", session.getSnapshot().values);
};
