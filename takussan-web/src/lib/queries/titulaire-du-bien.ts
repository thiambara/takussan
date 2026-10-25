import { apiRequest } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';
import type { LeaseStatus } from '@/types/lease';

/**
 * TCK-999 (P15.06, Q5 ; ADR-0036, amendement du 2026-10-19, voie 3) — « changer le titulaire » d'un
 * bien saisi au nom du personnel : l'aperçu (`GET …/owner-transfer`, rien n'est écrit) puis le geste
 * (`PUT …/owner`). L'API juge tout : l'admin de l'agence seul, un bailleur actif pour cible, jamais
 * depuis un bailleur.
 */

export interface BailDuTransfert {
  readonly id: number;
  readonly reference_number: string | null;
  readonly status: LeaseStatus | null;
  readonly tenant_name: string | null;
}

export interface ApercuDuTransfert {
  readonly property_id: number;
  readonly current_owner: { readonly id: number; readonly name: string } | null;
  readonly new_owner: { readonly id: number; readonly name: string };
  /** Les baux `draft` de l'ancien titulaire : ils passent au bailleur. */
  readonly leases_moving: readonly BailDuTransfert[];
  /** Tous les autres : ils gardent leur bailleur. */
  readonly leases_staying: readonly BailDuTransfert[];
}

export interface BilanDuTransfert {
  readonly property_id: number;
  readonly user_id: number;
  readonly leases_moved: readonly number[];
  readonly leases_kept: readonly number[];
}

export const titulaireDuBienKeys = {
  apercu: (propertyId: number, ownerId: number) => ['property', propertyId, 'owner-transfer', ownerId] as const,
};

export function lireApercuDuTransfert(
  token: string,
  propertyId: number,
  ownerId: number,
  { locale, signal }: { readonly locale?: string; readonly signal?: AbortSignal } = {},
): Promise<ApiResponse<ApercuDuTransfert>> {
  return apiRequest<ApiResponse<ApercuDuTransfert>>(
    cheminApi`/api/properties/${propertyId}/owner-transfer${requete(new URLSearchParams({ owner_id: String(ownerId) }))}`,
    { token, locale, signal },
  );
}

export function transfererLeTitulaire(
  token: string,
  propertyId: number,
  ownerId: number,
  locale?: string,
): Promise<ApiResponse<BilanDuTransfert>> {
  return apiRequest<ApiResponse<BilanDuTransfert>>(cheminApi`/api/properties/${propertyId}/owner`, {
    token,
    locale,
    method: 'PUT',
    body: { owner_id: ownerId },
  });
}
