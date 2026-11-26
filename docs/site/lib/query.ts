import { QueryClient } from "@tanstack/react-query";

// The guide's Query client. Demos fail on purpose, so automatic retries and refetching
// when the window regains focus are off to avoid consuming a failure set up by a demo.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
// The options requested by async fields stay fresh for 30 s. Reopening a list goes through
// the loader and skips another trip to the server.
queryClient.setQueryDefaults(["trama"], { staleTime: 30_000 });
// Prices on the "Queries" page are never fresh, so each query goes back to the simulated
// server and the wait is visible in every demo. Query still shares an in-flight request.
queryClient.setQueryDefaults(["trama", "south-trading", "listPrice"], { staleTime: 0 });
queryClient.setQueryDefaults(["trama", "south-trading", "quote"], { staleTime: 0 });
// The same applies to line prices in "Async in rows". Changing the list requests them again.
queryClient.setQueryDefaults(["trama", "inventory", "linePrice"], { staleTime: 0 });
