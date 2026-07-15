import { QueryClient } from "@tanstack/react-query";

// The static app has no HTTP API: every query supplies its own queryFn that reads
// from lib/dataStore (committed JSON). So there is no default queryFn here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
