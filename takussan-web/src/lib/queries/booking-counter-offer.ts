'use client';

import { useApiMutation } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';
import type { Booking } from '@/types/booking';

/**
 * TCK-2876 (ADR-0110 § 5) — « Contre-proposer » : `POST /api/bookings/{id}/counter-offers`
 * (TCK-2873). Le personnel de l'agence du bien, sous `bookings.validate` ; une contre-offre ouverte
 * est REMPLACÉE par la suivante (« Modifier la contre-offre » est le même appel).
 *
 * Hors de `bookings.ts` : les tests de la fiche mockent ce module-là en entier.
 */
export type ContreOffreSaisie = {
  /** XOF entier, > 0 (principe 3). */
  readonly amount: number;
  readonly message?: string;
  /** Un jour `AAAA-MM-JJ` de Dakar, d'aujourd'hui à J+30 ; J+3 si absent. */
  readonly valid_until?: string;
};

export function useContreProposer(bookingId: number) {
  return useApiMutation<ApiResponse<Booking>, ContreOffreSaisie>(
    { path: cheminApi`/api/bookings/${bookingId}/counter-offers`, method: 'POST' },
    {
      relireSurErreur: true,
      invalidate: [
        ['bookings', 'detail', bookingId],
        ['bookings', 'list'],
      ],
    },
  );
}
