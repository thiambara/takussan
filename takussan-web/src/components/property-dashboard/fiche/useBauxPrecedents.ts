'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse } from '@/types/api';

/** Les baux clos d'un bien lus d'un coup : la ligne n'en nomme pas davantage. */
const BAUX_LUS = 20;

export interface BailPrecedent {
  readonly id: number;
  readonly reference_number: string | null;
}

/**
 * TCK-2639 (AC3, écart — suite : TCK-2841) — les baux CLOS du bien (`expired`, `terminated`, `renewed`),
 * dont l'onglet Documents ne lit pas les pièces déposées : `GET /api/documents` ne prend qu'une cible, et
 * l'onglet lit le bien et le bail en cours. L'onglet le dit, et renvoie vers chaque bail, plutôt que de
 * laisser croire que tout est là.
 */
export function useBauxPrecedents(propertyId: number): { readonly data: readonly BailPrecedent[]; readonly isError: boolean } {
  const query = useApiQuery<PaginatedResponse<BailPrecedent>>(['leases', 'precedents-du-bien', propertyId], '/api/leases', {
    params: {
      fields: { leases: ['id', 'reference_number'] },
      filter: { property_id: propertyId, status: 'expired,terminated,renewed' },
      sort: ['-start_date'],
      per_page: BAUX_LUS,
    },
  });
  return { data: query.data?.data ?? [], isError: query.isError };
}
