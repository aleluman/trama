// The runner of the differential fuzz of rule sets: it runs the operations
// of a case on a session of a definition, with the same schedule of
// responses for a form and its twin. What each step leaves is normalized:
// rows are named by their creation order, and labels lose the place of their
// rule set and the index of a flag contribution, as the twin numbers its
// arrays otherwise.
import { together } from "./rows-queries.mjs";
import { scriptedLoader } from "./scripted-loader.mjs";

// Names rows and normalizes labels. With base, the number of the last key
// given before the session opened, a row is named by its creation order in
// the session, read from its key, also when the opening fails; without it, by
// the order the normalizer first sees it.
export const normalizer = (base) => {
  const keys = [];
  const name = (key) => {
    if (base !== undefined) return `#${Number(key.slice(1)) - base - 1}`;
    if (!keys.includes(key)) keys.push(key);
    return `#${keys.indexOf(key)}`;
  };
  const text = (message) =>
    message
      .replaceAll(/row "([^"]+)"/gu, (_, key) => `row ${name(key)}`)
      .replaceAll(/\["([^"]+)"\]/gu, (_, key) => `[${name(key)}]`)
      .replaceAll(/ \(include\[\d+\]\)(?=:|$)/gu, "")
      .replaceAll(/\b(disabled|readOnly|hidden|required)\[\d+\]/gu, "$1");
  return { name, text };
};
export const statesOf = (states, text) =>
  Object.fromEntries(
    Object.entries(states).map(([key, { status, error }]) => [
      key,
      [status, error && text(error.message)],
    ]),
  );

// The keys of rows follow one counter per realm, so the key of a row made just
// before a session opens gives its base.
const probes = new WeakMap();
const lastKey = (core) => {
  let probe = probes.get(core);
  if (probe === undefined) {
    probe = core.defineForm({ fields: {}, collections: { x: { fields: {} } } });
    probes.set(core, probe);
  }
  const [key] = core.createSession(probe, { initial: { x: [{}] } }).getSnapshot().rows.x;
  return Number(key.slice(1));
};

// Runs the operations of the model on a session of the definition, one
// after another, and gives what each step leaves.
export const runSession = (core, definition, form, { readPasses } = {}) => {
  const { name, text } = normalizer(lastKey(core));
  const { loader, calls } = scriptedLoader();
  const traces = [];
  globalThis.tramaTrace = (trace) => traces.push(trace);
  let session;
  try {
    session = core.createSession(definition, {
      scope: "s",
      loader,
      initial: form.initial,
      ...(form.context ? { context: form.contextValue } : {}),
    });
  } catch (error) {
    return Promise.resolve([{ open: text(error.message) }]);
  }
  const observeState = observe(session, form, { name, text, calls, traces });
  const state = (error) => {
    const observed = observeState(error);
    readPasses?.(name);
    return observed;
  };
  const results = [state()];
  return form.operations
    .reduce(
      (previous, operation) =>
        previous
          .then(() => apply(session, operation, calls))
          .then(
            () => results.push(state()),
            (error) => results.push(state(error)),
          ),
      Promise.resolve(),
    )
    .then(() => results);
};
// What the session leaves after each step: its values, states, queries and
// rows, its outputs, how many times it notified, its requests, its error and
// the writes of the step, which count only if it finished.
const observe = (session, form, { name, text, calls, traces }) => {
  const view = session.list("a");
  view.subscribe(() => {});
  view.open();
  const seen = [];
  session.subscribe(() => seen.push(snapshotOf(session, name, text)));
  let outputs;
  if (form.output !== null)
    session.watchOutputs((all) => (outputs = all.out), {
      onError: (error) => (outputs = `error ${text(error.message)}`),
    });
  const traced = (trace) =>
    trace.map(([address, writer, value]) => [addressOf(address, name), text(writer), value]);
  return (error) => {
    const applied = traces.splice(0);
    return {
      error: error === undefined ? null : text(error.message),
      ...snapshotOf(session, name, text),
      outputs,
      publications: seen.splice(0),
      calls: calls.map(({ key, signal }) => [key[2], key[3], signal.aborted]),
      applied: error === undefined ? applied.map((trace) => traced(trace)) : null,
    };
  };
};

const snapshotOf = (session, name, text) => {
  const snapshot = session.getSnapshot();
  const rows = Object.fromEntries(
    Object.entries(snapshot.rows).map(([collection, keys]) => [
      collection,
      keys.map((key) => {
        const row = session.row(collection, key).getSnapshot();
        return [name(key), row.values, row.fieldStates, statesOf(row.queries, text)];
      }),
    ]),
  );
  const own = (record) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => !(key in rows)));
  return {
    header: own(snapshot.values),
    states: own(snapshot.fieldStates),
    queries: statesOf(snapshot.queries, text),
    rows,
  };
};
const addressOf = (address, name) =>
  typeof address === "string"
    ? address
    : `${address.row.collection.name}${name(address.row.key)}.${address.field}`;

const keyAt = (session, collection, index) => {
  const keys = session.getSnapshot().rows[collection];
  return keys.length === 0 ? undefined : keys[index % keys.length];
};
const apply = async (session, [kind, ...args], calls) => {
  if (kind === "edit") session.edit(args[0], args[1]);
  else if (kind === "rowEdit") {
    const key = keyAt(session, args[0], args[1]);
    if (key !== undefined) session.row(args[0], key).edit(args[2], args[3]);
  } else if (kind === "patch") {
    const key = keyAt(session, args[2], args[3]);
    session.patch({
      [args[0]]: args[1],
      ...(key === undefined ? {} : { [args[2]]: { [key]: { [args[4]]: args[5] } } }),
    });
  } else if (kind === "patchFields") {
    const [header, row] = args;
    const key = row && keyAt(session, row[0], row[1]);
    session.patch({
      ...Object.fromEntries(header),
      ...(key === undefined ? {} : { [row[0]]: { [key]: Object.fromEntries(row[2]) } }),
    });
  } else if (kind === "add") {
    const length = session.getSnapshot().rows[args[0]].length;
    session.add(
      args[0],
      Array.from({ length: args[1] }, () => Object.fromEntries(args[3])),
      { at: args[2] % (length + 1) },
    );
  } else if (kind === "remove") {
    const key = keyAt(session, args[0], args[1]);
    if (key !== undefined) session.remove(args[0], [key]);
  } else if (kind === "move") {
    const keys = session.getSnapshot().rows[args[0]];
    if (keys.length > 0) session.move(args[0], keys[args[1] % keys.length], args[2] % keys.length);
  } else if (kind === "reset") session.reset();
  else if (kind === "retry") {
    const key = args[1] === undefined ? undefined : keyAt(session, args[1], args[2]);
    if (key === undefined) session.retry(args[0]);
    else session.row(args[1], key).retry(args[3]);
  } else if (calls.length > 0) {
    if (kind === "settle") await calls[args[0] % calls.length][args[1]](new Error("No network"));
    else if (kind === "batch")
      await together(calls[args[0] % calls.length], calls[args[1] % calls.length]);
    else {
      const aborted = calls.filter(({ signal }) => signal.aborted);
      if (aborted.length > 0) await aborted[args[0] % aborted.length].resolve();
    }
  }
};
