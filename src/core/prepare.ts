// The preparation of a submission: one attempt pending per session. prepare
// cancels the attempt that was waiting, marks the attempt and waits only for
// the queries forPrepare in flight; it looks again at the end of each
// publication, once their responses applied, the queries followed and the
// listeners heard. An operation of the application that changes values or
// rows, a reset, the signal or another prepare cancel it; an operation without
// effect, a response and a commit do not. Then, in one synchronous section,
// it captures: invalid with the problems, or ready with a prepared.
import type { Field } from "./address.js";
import type { Compiled } from "./compiled.js";
import { describe, isPlainRecord } from "./data.js";
import type { FormDefinition } from "./definition.js";
import type { Engine, Publication } from "./engine.js";
import { issuesOf, type Failed, type Issue } from "./issues.js";
import { messageOf } from "./messages.js";
import { markAttempt, type SessionState } from "./notify.js";
import { preparedOf, type Ready } from "./prepared.js";
import type { Queries } from "./queries.js";

type Outcome =
  | Ready
  | { readonly status: "invalid"; readonly issues: readonly Issue[] }
  | { readonly status: "cancelled" };
type Waiting = {
  readonly resolve: (outcome: Outcome) => void;
  readonly reject: (error: unknown) => void;
  readonly signal: AbortSignal | undefined;
};
const cancelled: Outcome = Object.freeze({ status: "cancelled" });

export const preparer = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  engine: Engine<D>,
  queries: Queries,
) => {
  let waiting: Waiting | undefined;
  const end = () => {
    const found = waiting as Waiting;
    waiting = undefined;
    found.signal?.removeEventListener("abort", cancel);
    return found;
  };
  // Resolves the attempt waiting, if any, as cancelled.
  function cancel() {
    if (waiting !== undefined) end().resolve(cancelled);
  }
  const capture = () => captured(state.published, compiled, engine, queries);
  // At the end of each publication, the attempt waiting captures once no query
  // it needs is in flight.
  function settle() {
    if (waiting === undefined || queries.needed > 0) return;
    const { resolve, reject } = end();
    try {
      resolve(capture());
    } catch (error) {
      reject(error);
    }
  }
  return {
    cancel,
    settled: settle,
    prepare: (options: unknown): Promise<Outcome> => {
      const signal = signalOf(options);
      cancel();
      markAttempt(state);
      if (signal?.aborted === true) return Promise.resolve(cancelled);
      const outcome = new Promise<Outcome>((resolve, reject) => {
        waiting = { resolve, reject, signal };
        signal?.addEventListener("abort", cancel);
      });
      // Without a query to wait for, it captures now.
      settle();
      return outcome;
    },
  };
};

// The options of prepare: an optional signal.
const signalOf = (options: unknown) => {
  if (options === undefined) return;
  if (!isPlainRecord(options)) throw new Error("prepare: options must be an object");
  for (const key of Object.keys(options))
    if (key !== "signal") throw new Error(`prepare: unknown option ${describe(key)}`);
  const { signal } = options;
  if (signal !== undefined && !(signal instanceof AbortSignal))
    throw new Error("prepare: signal must be an AbortSignal");
  return signal;
};

// The outcome of the last publication: a local error or a failed query the
// submission needed make it invalid; otherwise the engine captures a prepared.
// The counts hold external errors too, which block nothing: it is invalid
// only when it finds a problem.
const captured = <D extends FormDefinition>(
  published: Publication<D>,
  compiled: Compiled,
  engine: Engine<D>,
  queries: Queries,
): Outcome => {
  const failed = failedOf(published, compiled, queries);
  if (published.form.errorCount > 0 || failed.size > 0) {
    const issues = issuesOf(compiled, published, "errors", failed);
    if (issues.length > 0) return Object.freeze({ status: "invalid", issues });
  }
  return preparedOf(
    engine.capture(unsettledOf(queries)),
    issuesOf(compiled, published, "warnings", noFailures),
  );
};
const noFailures: Failed = new Map();

// The fields whose query had not arrived: a request in flight, or a failure.
const unsettledOf = (queries: Queries) => {
  const unsettled = new Set<Field>();
  for (const [address, { request, state }] of queries.entries)
    if (request !== undefined || state.status === "error") unsettled.add(address);
  return unsettled;
};

// The fields whose query a submission needed and failed, each with the message
// of the application for its label.
const failedOf = <D extends FormDefinition>(
  published: Publication<D>,
  compiled: Compiled,
  queries: Queries,
): Failed => {
  const failed = new Map<Field, string>();
  for (const [address, entry] of queries.entries) {
    if (!entry.query.forPrepare || entry.state.status !== "error") continue;
    const states =
      typeof address === "string"
        ? published.fieldStates
        : published.rowStates.get(address.row.key);
    const name = typeof address === "string" ? address : address.field;
    const label = (states as Record<string, { readonly label?: string }> | undefined)?.[name]
      ?.label;
    failed.set(address, messageOf(compiled.messages, "query", { label }));
  }
  return failed;
};
