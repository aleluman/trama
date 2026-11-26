// The parts of a session around its engine: the observers of its outputs and
// its queries.
import type { FormDefinition } from "./definition.js";
import type { Compiled } from "./compiled.js";
import type { Engine, Publication, Receipt } from "./engine.js";
import type { Loader, Scope } from "./endpoints.js";
import { following, notifyObserver, publish, publishQueries, type SessionState } from "./notify.js";
import { outputObserver } from "./outputs.js";
import {
  createQueries,
  followQueries,
  headerEntry,
  openQueries,
  retryQuery,
  rowQueries,
  type Entry,
  type Queries,
} from "./queries.js";
import type { HandleHost } from "./handles.js";
import { preparer } from "./prepare.js";
import type { Session } from "./session-types.js";

// An observer of the outputs, notified as the listeners are.
export const watching =
  <D extends FormDefinition>(
    state: SessionState<D>,
    compiled: Compiled,
  ): Session<D>["watchOutputs"] =>
  (callback, observerOptions) => {
    const observer = outputObserver(compiled.outputs.named, callback, (run) =>
      notifyObserver(state, run, observerOptions?.onError),
    );
    state.outputObservers.add(observer);
    observer(state.published.outputs);
    return () => {
      state.outputObservers.delete(observer);
    };
  };

// The queries of a session commit each batch of accepted responses as an
// operation of its engine. The fields supplied are not queried at opening nor
// at reset, as the receipt of the engine says. Gives them, and how they follow
// a change and open again, each with its receipt.
export const queriesOf = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  engine: Engine<D>,
  {
    scope,
    loader,
    context,
  }: {
    readonly scope: Scope | undefined;
    readonly loader: Loader;
    readonly context: object | undefined;
  },
) => {
  const queries = createQueries(compiled, {
    scope: scope as Scope,
    loader,
    context,
    fields: compiled.fields,
    collections: compiled.collections,
    published: () => state.published,
    commit: (patch, settle, before) => {
      const publication = engine.respond(patch, before);
      settle();
      publish(state, publication, state.snapshot.resetVersion, follow);
    },
    changed: (states) => publishQueries(state, states),
  });
  const follow = (receipt: Receipt) => followQueries(queries, receipt);
  const reopen = (receipt: Receipt) => openQueries(queries, receipt);
  return { queries, follow, reopen };
};

// The retries of a session, each a command that publishes the states of the
// queries alone: of a field of the header by name, and of a field of a row by
// address, which its handle checked; the handles also read the states of the
// queries of their rows.
export const retriesOf = <D extends FormDefinition>(state: SessionState<D>, queries: Queries) => {
  const retried = (entry: Entry) => {
    if (following(state, () => retryQuery(queries, entry))) publishQueries(state, queries.states);
  };
  const row: Pick<HandleHost, "queries" | "retry"> = {
    queries: (collection, key) => rowQueries(queries, collection, key),
    retry: (address) => retried(queries.entries.get(address) as Entry),
  };
  return { header: (name: unknown) => retried(headerEntry(queries, name)), row };
};

// The members of a session around its submission. An operation of the
// application cancels a prepare that waits when it changed values or rows;
// reset cancels it too and drops the attempt. Gives how the application
// operates, and the members.
export const submitting = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  engine: Engine<D>,
  asked: ReturnType<typeof queriesOf>,
  guard: (operation: string) => void,
) => {
  const prepares = preparer(state, compiled, engine, asked.queries);
  state.settled = prepares.settled;
  const published = (publication: Publication<D>) =>
    publish(state, publication, state.snapshot.resetVersion, asked.follow);
  const members: Pick<Session<D>, "reset" | "prepare" | "commit"> = {
    reset: () => {
      guard("reset");
      // A restore that fails changes nothing: the attempt that waits and what
      // the session keeps beside the engine leave only with one that succeeded.
      const restored = engine.restore();
      prepares.cancel();
      state.attempt = undefined;
      state.touched = { rows: new WeakSet(), version: state.touched.version + 1 };
      state.sources.clear();
      publish(state, restored, state.snapshot.resetVersion + 1, asked.reopen);
    },
    prepare: (options) => {
      guard("prepare");
      return prepares.prepare(options) as never;
    },
    commit: (prepared, canonical) => {
      guard("commit");
      const publication = engine.accept(prepared, canonical);
      if (publication === undefined) return false;
      published(publication);
      return true;
    },
  };
  const operate = (publication: Publication<D>) => {
    if (publication.receipt.changed?.size !== 0) prepares.cancel();
    published(publication);
  };
  return { operate, members };
};
