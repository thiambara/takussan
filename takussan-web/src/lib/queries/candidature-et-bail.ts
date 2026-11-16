'use client';

import { useApiMutation } from '@/hooks/useApiQuery';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import { cheminApi } from '@/lib/chemin-api';
import { FIL_QUERY_KEY } from '@/lib/queries/customer-timeline';
import type { ApiResponse } from '@/types/api';
import type { Lease } from '@/types/lease';

/**
 * TCK-2878 (ADR-0110 § 3, § 8, § 10) — les gestes de la candidature qui arrive, puis du bail : le
 * retour de l'étape de la fiche (« Passé en Négociation · Annuler »), la création du bail repris de la
 * candidature (le panneau du bureau), et les garants d'une candidature. Hors de `bookings.ts` et de
 * `booking-dossier.ts` : les tests de la fiche mockent ces deux modules en fabriques fermées.
 */

const DETAIL = (bookingId: number) => ['bookings', 'detail', bookingId] as const;

/**
 * `POST /api/customers/{id}/pipeline-stage/undo` (TCK-2874) : la fiche reprend l'étape d'avant
 * l'acceptation. Relit la réservation (son `stage_change.undone_at`), la fiche, le fil et le
 * pipeline — sur erreur aussi : un 409 ou un 422 dit que l'état lu a changé.
 */
export function useAnnulerLePassageDEtape(customerId: number, bookingId: number) {
  return useApiMutation<unknown, void>(
    { path: cheminApi`/api/customers/${customerId}/pipeline-stage/undo`, method: 'POST', body: () => undefined },
    {
      relireSurErreur: true,
      invalidate: [DETAIL(bookingId), ['customers'], ['agent-crm'], FIL_QUERY_KEY.tout(customerId), PIPELINE_QUERY_KEY.root()],
    },
  );
}

/**
 * Le corps du bail repris : le loyer et la caution AFFICHÉS (ceux de la candidature) ; la fin, absente,
 * est reprise du terme par l'API ; `guarantor_id` n'est jamais envoyé, les garants de la candidature
 * sont rattachés par l'API (TCK-2894).
 */
export type BailReprisPayload = {
  readonly property_id: number;
  readonly tenant_id: number;
  readonly booking_id: number;
  readonly type: string;
  readonly start_date: string;
  readonly end_date?: string;
  readonly monthly_rent?: number;
  readonly deposit_amount?: number;
  readonly currency?: string;
};

/** `POST /api/leases` avec `booking_id` : la réservation passe à `completed`, elle se relit. */
export function useCreerLeBailRepris(bookingId: number) {
  return useApiMutation<ApiResponse<Lease>, BailReprisPayload>(
    { path: '/api/leases', method: 'POST' },
    { invalidate: [['leases', 'list'], DETAIL(bookingId), ['bookings', 'list']] },
  );
}

/** Les champs d'un garant saisi à la volée (`AttachBookingGuarantorRequest::fieldRules`). */
export type GarantSaisi = {
  readonly first_name: string;
  readonly last_name: string;
  readonly phone?: string;
  readonly relationship_to_tenant?: string;
};

/** `POST /api/bookings/{id}/guarantors` (TCK-2893) : relit la réservation (garants, dossier) et son dossier. */
export function useAjouterUnGarant(bookingId: number) {
  return useApiMutation<unknown, GarantSaisi>(
    { path: cheminApi`/api/bookings/${bookingId}/guarantors`, method: 'POST' },
    { invalidate: [DETAIL(bookingId), ['bookings', 'dossier', bookingId]] },
  );
}

/** `DELETE /api/bookings/{id}/guarantors/{garant}` : relit la réservation et son dossier, sur erreur aussi. */
export function useRetirerUnGarant(bookingId: number) {
  return useApiMutation<unknown, { readonly guarantorId: number }>(
    { path: ({ guarantorId }) => cheminApi`/api/bookings/${bookingId}/guarantors/${guarantorId}`, method: 'DELETE', body: () => undefined },
    { relireSurErreur: true, invalidate: [DETAIL(bookingId), ['bookings', 'dossier', bookingId]] },
  );
}
