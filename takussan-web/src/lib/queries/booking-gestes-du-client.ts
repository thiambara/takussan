'use client';

import { useApiMutation } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';
import type { Booking, DossierPiece, PieceDuDossier } from '@/types/booking';

/**
 * TCK-2879 — les gestes du CLIENT sur sa réservation : déposer une pièce du dossier (TCK-2872),
 * accepter ou décliner la contre-offre de l'agence (TCK-2873). Hors de `bookings.ts`,
 * `booking-dossier.ts` et `booking-counter-offer.ts` : les tests de la fiche mockent ces modules en
 * fabrique fermée.
 */

/** Les types que `UploadBookingDossierPieceRequest` accepte (PDF, JPEG, PNG, HEIC/HEIF), 10 Mo. */
export const PIECE_DU_DOSSIER_ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif';
export const PIECE_DU_DOSSIER_MAX_OCTETS = 10 * 1024 * 1024;

/**
 * `POST /api/bookings/{id}/dossier/{piece}/document` (multipart, `file`) → 201, la pièce et la
 * complétude. Relit le dossier (la clé de `DOSSIER_QUERY_KEY`, écrite ici : les tests de la fiche
 * mockent `booking-dossier.ts` sans elle), la fiche et la liste (la carte passe à « 4/4 »).
 */
export function useDeposerUnePiece(bookingId: number) {
  return useApiMutation<ApiResponse<PieceDuDossier>, { piece: DossierPiece; file: File }>(
    {
      path: ({ piece }) => cheminApi`/api/bookings/${bookingId}/dossier/${piece}/document`,
      method: 'POST',
      formData: true,
      body: ({ file }) => {
        const form = new FormData();
        form.append('file', file);
        return form;
      },
    },
    { relireSurErreur: true, invalidate: [['bookings', 'dossier', bookingId], ['bookings', 'detail', bookingId], ['bookings', 'list']] },
  );
}

/**
 * `POST /api/bookings/{id}/counter-offers/{counterOffer}/accept|decline` : accepter confirme l'offre
 * au montant de la contre-offre (`BookingService::confirm`) ; décliner la laisse en attente de l'agence.
 */
export function useRepondreALaContreOffre(bookingId: number) {
  return useApiMutation<ApiResponse<Booking>, { contreOffreId: number; reponse: 'accept' | 'decline' }>(
    {
      path: ({ contreOffreId, reponse }) =>
        reponse === 'accept'
          ? cheminApi`/api/bookings/${bookingId}/counter-offers/${contreOffreId}/accept`
          : cheminApi`/api/bookings/${bookingId}/counter-offers/${contreOffreId}/decline`,
      method: 'POST',
      body: () => undefined,
    },
    { relireSurErreur: true, invalidate: [['bookings', 'detail', bookingId], ['bookings', 'list']] },
  );
}
