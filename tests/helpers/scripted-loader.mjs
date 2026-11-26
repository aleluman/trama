// Loaders the tests drive, and helpers to observe option lists, without React
// and without waiting for time.
//
// scriptedLoader() returns { loader, calls }. Pass loader to createSession.
// Each request the session makes is pushed to calls as
//   { key, run, signal, resolve(), reject(error) }
// and stays pending until the test settles it, in any order:
// - resolve() runs run(signal) as the direct loader does, so the endpoint's
//   load, the validation and the frozen copy happen as in real use. It returns
//   what run returned; when run fails, the request fails with that error and
//   resolve() returns undefined.
// - reject(error) fails the request with a transport error, without running it.
// Both return once the view has taken the outcome.
// To settle several requests in one task, as a fresh cache does, ready() runs
// run(signal) as resolve() does and gives a delivery, and refusal(error) gives
// one of a transport error; calling the deliveries in a row hands the outcomes
// to the session before the close of their batch.
//
// cachingLoader() keeps what run returns under the JSON of its key, as a cache
// with JSON keys does, and answers a key it holds without running it. A failed
// run is not kept. It exposes { loader, cache, runs }.
//
// settle() waits until every pending microtask ran, with setImmediate.
// pageOf(rows, request, size) is the page of rows a paged server returns.
// watch(session, name) opens a view with one subscriber that counts its
// notifications; shown(view) is what the view shows, in labels.

export const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

export function scriptedLoader() {
  const calls = [];
  const loader = (key, run, options) => {
    const pending = Promise.withResolvers();
    const { signal } = options;
    calls.push({
      key,
      run,
      signal,
      async resolve() {
        let result;
        try {
          result = await run(signal);
          pending.resolve(result);
        } catch (error) {
          pending.reject(error);
        }
        await settle();
        return result;
      },
      async reject(error) {
        pending.reject(error);
        await settle();
      },
      async ready() {
        try {
          const result = await run(signal);
          return () => pending.resolve(result);
        } catch (error) {
          return () => pending.reject(error);
        }
      },
      refusal: (error) => () => pending.reject(error),
    });
    return pending.promise;
  };
  return { loader, calls };
}

export function cachingLoader() {
  const cache = new Map();
  let runs = 0;
  const loader = async (key, run, { signal }) => {
    const hash = JSON.stringify(key);
    if (cache.has(hash)) return cache.get(hash);
    runs++;
    const result = await run(signal);
    cache.set(hash, result);
    return result;
  };
  return {
    loader,
    cache,
    get runs() {
      return runs;
    },
  };
}

// The rows whose label includes the search, without case, as fresh objects.
export const pageOf = (rows, { search, page }, size = 2) => {
  const found = rows.filter((row) => row.label.toLowerCase().includes(search.toLowerCase()));
  const start = (page - 1) * size;
  return {
    options: found.slice(start, start + size).map((row) => structuredClone(row)),
    more: start + size < found.length,
  };
};

export function watch(session, name) {
  const view = session.list(name);
  let notifications = 0;
  const stop = view.subscribe(() => {
    notifications++;
  });
  return {
    view,
    stop,
    get notifications() {
      return notifications;
    },
  };
}

// An opened view of the field, with one subscriber.
export const opened = (session, name) => {
  const { view } = watch(session, name);
  view.open();
  return view;
};

export const shown = (view) => {
  const { status, text, options, complete, error } = view.getSnapshot();
  return {
    status,
    text,
    labels: options.map((option) => option.label),
    complete,
    error: error?.message,
  };
};
