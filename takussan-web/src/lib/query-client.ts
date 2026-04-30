import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/**
 * Default `QueryClient` configuration for Takussan.
 *
 * - 5 minute stale time (TCK-057 spec) — callers override per-query when
 *   fresher/staler data is needed.
 * - One retry by default, but skip retries on 4xx responses (client errors
 *   rarely recover by retrying).
 * - `refetchOnWindowFocus` stays on, `refetchOnReconnect` stays on — both are
 *   cheap with the 5-min stale time.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
