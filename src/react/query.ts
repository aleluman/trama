import type { Loader } from "../core/index.js";

// The part of a TanStack Query client the loader uses, typed structurally so
// that trama-forms/react does not import it.
export type QueryClientLike = {
  fetchQuery<T>(options: {
    queryKey: readonly unknown[];
    queryFn: (context: { signal: AbortSignal }) => Promise<T>;
    structuralSharing: false;
  }): Promise<T>;
};

// Shares the cache of the application's Query client. Structural sharing
// would rebuild unfrozen the options that change in part, so it is off. The
// signal is Query's own: one view that stops does not abort a request that
// others share. The application sets how long pages stay fresh with
// setQueryDefaults(["trama"], …). Query does not keep undefined, which a
// value endpoint may resolve with: the cache keeps a mark instead.
const nothing = Object.freeze({});
export const queryLoader = (client: QueryClientLike): Loader => {
  if (typeof client !== "object" || client === null || typeof client.fetchQuery !== "function")
    throw new Error("queryLoader requires a QueryClient");
  return async <T>(key: Parameters<Loader>[0], run: (signal: AbortSignal) => Promise<T>) => {
    const result = await client.fetchQuery<unknown>({
      queryKey: key,
      queryFn: async ({ signal }) => {
        const value = await run(signal);
        return value === undefined ? nothing : value;
      },
      structuralSharing: false,
    });
    return (result === nothing ? undefined : result) as T;
  };
};
