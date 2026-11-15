'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking, DossierDeLaReservation, DossierPiece, PieceDuDossier } from '@/types/booking';

/**
 * TCK-2875 (ADR-0110) — les lectures et le geste de la fiche d'une candidature qui ne vivent pas dans
 * `bookings.ts` : le dossier et ses pièces (TCK-2872), « Demander » une pièce, les autres candidatures
 * en attente du bien (« Comparer »), et les visites du client lues au fil de sa fiche (TCK-2894).
 * Chacune n'est montée que là où la fiche en a besoin : jamais une lecture par ligne d'une liste.
 */

export const DOSSIER_QUERY_KEY = (bookingId: number) => ['bookings', 'dossier', bookingId] as const;

/** `GET /api/bookings/{id}/dossier` : la complétude et les pièces (reçues, demandées, leur document). */
export function useDossierDeLaReservation(bookingId: number) {
  return useApiQuery<ApiResponse<DossierDeLaReservation>>(DOSSIER_QUERY_KEY(bookingId), cheminApi`/api/bookings/${bookingId}/dossier`);
}

/**
 * `POST /api/bookings/{id}/dossier/{piece}/request` : le client est prévenu (s'il a un compte), la
 * pièce est datée « demandée ». Relit le dossier, et la réservation (sa complétude).
 */
export function useDemanderUnePiece(bookingId: number) {
  return useApiMutation<ApiResponse<PieceDuDossier & { customer_notified: boolean }>, { piece: DossierPiece }>(
    { path: ({ piece }) => cheminApi`/api/bookings/${bookingId}/dossier/${piece}/request`, method: 'POST', body: () => undefined },
    {
      // Un refus (429 : déjà demandée) relit aussi le dossier : le geste se tait avec sa date.
      relireSurErreur: true,
      invalidate: [DOSSIER_QUERY_KEY(bookingId), ['bookings', 'detail', bookingId]],
    },
  );
}

/**
 * « Comparer » : les candidatures EN ATTENTE du même bien, la plus récente d'abord — le nom du client
 * et la complétude de son dossier (servie sans être demandée). Deux lignes suffisent : la réservation
 * ouverte, et une autre.
 */
export function useAutresCandidaturesDuBien(propertyId: number) {
  return useApiQuery<PaginatedResponse<Booking>>(['bookings', 'list', 'autres-candidatures', propertyId], '/api/bookings', {
    params: {
      fields: { bookings: ['id', 'customer_id', 'agency_id', 'kind', 'status', 'created_at'], customers: ['id', 'first_name', 'last_name'] },
      filter: { property_id: propertyId, kind: 'application', status: 'pending' },
      include: ['customer'],
      sort: ['-created_at'],
      per_page: 2,
    },
  });
}

/**
 * Les visites et les comptes rendus du client, au fil de sa fiche (`filter[type]=note,visit`), en une
 * page de 100 — la borne de l'API. Le front borne au bien (`visitesEffectueesSurLeBien`).
 */
export function useVisitesDuClient(customerId: number) {
  return useApiQuery<PaginatedResponse<EntreeDuFil>>(['customer-timeline', customerId, 'note,visit', 'reservation'], cheminApi`/api/customers/${customerId}/timeline`, {
    params: { filter: { type: 'note,visit' }, per_page: 100 },
  });
}
