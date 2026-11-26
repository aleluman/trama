import { openEngine } from "./engine.js";
import { compiledFor } from "./compiled.js";
import { following, guardOf, publishQueries, stateOf, subscriber } from "./notify.js";
import { sessionOptions, type OptionsArgument } from "./options.js";
import { listsOf } from "./session-lists.js";
import { queriesOf, retriesOf, submitting, watching } from "./session-parts.js";
import { rowCommands } from "./session-rows.js";
import { marking } from "./session-marks.js";
import type { FormDefinition } from "./definition.js";
import type { Session } from "./session-types.js";
export type { Issue, Prepared, Session, Snapshot } from "./session-types.js";

export const createSession = <D extends FormDefinition>(
  definition: D,
  ...[options]: OptionsArgument<D>
): Session<D> => {
  const compiled = compiledFor(definition);
  const settings = sessionOptions(options, compiled);
  const { opened, engine } = openEngine<D>(compiled, options?.initial, settings.context);
  const state = stateOf(opened);
  const asked = queriesOf(state, compiled, engine, settings);
  // The queries start once the opening is published, before anyone hears of it.
  publishQueries(
    state,
    following(state, () => asked.reopen(opened.receipt)),
  );
  const guard = guardOf(state);
  const { operate, members } = submitting(state, compiled, engine, asked, guard);
  const lists = listsOf(state, compiled, settings);
  const retries = retriesOf(state, asked.queries);
  const marks = marking(state, compiled, engine, guard, operate);
  const rows = rowCommands(state, compiled, engine, guard, operate, {
    list: lists.row,
    ...retries.row,
    ...marks.row,
  });
  return {
    definition,
    list: (name) => lists.header(name) as never,
    getSnapshot: () => state.snapshot,
    watchOutputs: watching(state, compiled),
    subscribe: subscriber(state.listeners),
    edit: (name, value) => {
      guard("edit");
      operate(engine.edit(name, value));
    },
    row: rows.row as Session<D>["row"],
    add: rows.add as Session<D>["add"],
    remove: rows.remove,
    move: rows.move,
    patch: rows.patch,
    retry: (name) => {
      guard("retry");
      retries.header(name);
    },
    touch: marks.header.touch,
    input: marks.header.input,
    ...marks.external,
    ...members,
  };
};
