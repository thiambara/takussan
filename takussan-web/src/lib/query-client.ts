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
 * - TCK-1479 (P113.03) — `networkMode: 'always'` pour les SEULES mutations : hors ligne, une
 *   écriture part tout de suite et échoue en erreur réseau, par le chemin d'erreur de l'écran.
 *   Sous le défaut `online`, elle restait suspendue sans le dire puis partait seule au retour du
 *   réseau — l'initiation d'un paiement redirigeait alors chez le fournisseur, minutes plus tard.
 *   Les lectures gardent `online` : elles reprennent d'elles-mêmes, sans effet de bord.
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
        networkMode: 'always',
      },
    },
  });
}
