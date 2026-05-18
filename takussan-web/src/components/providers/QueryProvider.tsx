'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { createQueryClient } from '@/lib/query-client';

/**
 * Root React Query provider. Instantiates a single {@link QueryClient} per
 * browser session (via `useState` initializer so Fast Refresh doesn't
 * re-instantiate it on every render) and mounts the devtools in development.
 *
 * Must be a client component — `QueryClientProvider` relies on React context
 * and useSyncExternalStore, both client-only.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
