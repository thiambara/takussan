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

  // ⚠️ NE RIEN ENREGISTRER ICI. Une version précédente y prêtait le traducteur de l'application
  // à une variable de module de `src/lib/api.ts`, pour que `ApiError.displayMessage` puisse
  // traduire. C'était faux deux fois : ce composant est `'use client'`, donc les 16 modules
  // `'use server'` de `src/app/actions/` n'étaient jamais couverts et rendaient la CLÉ i18n brute
  // à l'écran ; et un global de processus Node est partagé entre requêtes concurrentes, donc la
  // locale du dernier rendu SSR aurait fuité d'un visiteur à l'autre.
  //
  // `ApiError` porte désormais un CODE (`codeErreur`), et chaque surface le traduit avec le
  // traducteur qu'elle sait obtenir : `useTranslations` côté client, `getTranslations` de
  // `next-intl/server` dans un module `'use server'`. Voir `src/lib/api.ts` (TCK-292, AC7).

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
