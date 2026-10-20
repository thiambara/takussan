'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse } from '@/types/api';
import type { Lease } from '@/types/lease';

/**
 * TCK-1042 (P70.07) — séparé de `leases.ts`, qui le réexporte : la modale de bienvenue du
 * locataire est montée par la coque de `/app`, et importer `leases.ts` y faisait entrer ses
 * 42 exports, que le bundler n'élague pas (mesuré sur le JS de `/app/overview`).
 */
export type ActiveLeaseSummary = Pick<Lease, 'id' | 'reference_number'>;

/**
 * TCK-968 (P48.01) — les baux actifs du compte, pour la modale de bienvenue et la check-list
 * d'entrée du locataire. Par l'API Laravel : un `fetch` relatif vers `/api/leases` visait le serveur
 * Next, qui n'a pas ce relais, et les deux ne s'affichaient jamais. Une seule clé pour les deux
 * lecteurs de l'accueil, donc une seule requête.
 */
export function useActiveLeaseSummaries(enabled = true) {
  return useApiQuery<PaginatedResponse<ActiveLeaseSummary>>(
    ['leases', 'active-summaries'],
    '/api/leases',
    {
      params: {
        fields: { leases: ['id', 'reference_number'] },
        filter: { status: 'active' },
        per_page: 50,
      },
      enabled,
    },
  );
}
