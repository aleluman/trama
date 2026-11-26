import assert from "node:assert/strict";

// Rejects the operation with the exact diagnostic, keeps the snapshot and notifies nothing.
export const rejects = (session, operation, message, cause) => {
  const before = session.getSnapshot();
  const observed = [];
  const stop = session.subscribe(() => observed.push(session.getSnapshot()));
  assert.throws(operation, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, message);
    if (cause !== undefined) assert.equal(error.cause, cause);
    return true;
  });
  stop();
  assert.equal(session.getSnapshot(), before);
  assert.deepEqual(observed, []);
};

// The outputs the session publishes now.
export const currentOutputs = (session) => {
  let outputs;
  session.watchOutputs((all) => {
    outputs = all;
  })();
  return outputs;
};

// The failure of one output of the session, or undefined if it is available.
export const outputFailure = (session, name) => {
  let error;
  session.watchOutputs((outputs) => void outputs[name], { onError: (cause) => (error = cause) })();
  return error;
};

// The field states the session publishes now.
export const states = (session) => session.getSnapshot().fieldStates;

// Every field state projected, as { [field]: project(state) }.
export const mapStates = (session, project) =>
  Object.fromEntries(
    Object.entries(states(session)).map(([name, state]) => [name, project(state)]),
  );

// One property of every field state, as { [field]: { [property]: value } }.
export const pickStates = (session, property) =>
  mapStates(session, (state) => ({ [property]: state[property] }));

// A rule that fails when source takes the given value.
export const failsAt =
  (value, message, result) =>
  ({ source }) => {
    if (source === value) throw new Error(message);
    return result;
  };

// The keys of the rows of a collection, in visual order.
export const keysOf = (session, collection = "lines") => session.getSnapshot().rows[collection];
// A generator of numbers from a seed, the same sequence each run, so a failure repeats.
export const random = (seed) => () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};
export const pick = (next, items) => items[Math.floor(next() * items.length)];
// The snapshots the subscribers of a session hear from now on.
export const heard = (session) => {
  const snapshots = [];
  session.subscribe(() => snapshots.push(session.getSnapshot()));
  return snapshots;
};
