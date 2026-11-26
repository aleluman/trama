import { createSession, defineForm, field } from "trama-forms/core";

const counter = defineForm({
  fields: { count: field.number({ default: 0 }) },
});

export const run = (log: (label: string, value: unknown) => void) => {
  const session = createSession(counter);
  const opened = session.getSnapshot();
  log("getSnapshot() returns the same object", session.getSnapshot() === opened);
  log("the snapshot is frozen", Object.isFrozen(opened) && Object.isFrozen(opened.values));

  // subscribe notifies after each edit or reset. It returns the unsubscribe function.
  const stop = session.subscribe(() => {
    log("subscribe", session.getSnapshot().values);
  });

  session.edit("count", 1);
  session.edit("count", 2);
  log("editing publishes a new snapshot", session.getSnapshot() !== opened);

  session.reset();
  log("reset increments resetVersion", session.getSnapshot().resetVersion);

  stop();
  session.edit("count", 5);
  log(
    "after unsubscribing, the value still changes without notifications",
    session.getSnapshot().values,
  );
};
