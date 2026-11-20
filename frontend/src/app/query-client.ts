import { QueryClient } from '@tanstack/react-query';

/**
 * One client for the application (T088).
 *
 * `refetchOnWindowFocus` is left at its default because the health panel is the
 * only query so far and a person returning to the tab should see current state.
 * A failure is never retried automatically - the service's own `Retry-After` is
 * surfaced to the user instead of being obeyed silently.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Reference data is stable for minutes; heavy lists must not refetch on
        // every window focus (Feature 019, FR-014).
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}