import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-2753 (ADR-0108) — le départ d'un bailleur de l'agence.
 *
 * `GET /api/owners/{id}/departure` dit ce qui l'empêche encore, avec le MÊME inventaire que le refus
 * du geste (`OwnerDeparture::inventory`) ; `DELETE /api/owners/{id}` le fait partir — l'administrateur
 * actif de l'agence, sous double authentification (`ProtectedActions::AGENCY_TWO_FACTOR`).
 */

/** Les cinq raisons d'un refus, dans l'ordre d'ADR-0108 § 4. */
export const RAISONS_DU_DEPART = ['properties', 'leases', 'positive_balance', 'upcoming_payouts', 'unpaid_out_pieces'] as const;
export type RaisonDuDepart = (typeof RAISONS_DU_DEPART)[number];

export interface OwnerDepartureInventory {
  readonly blocking: Readonly<Record<RaisonDuDepart, number>>;
  /** Le solde cumulé au jour (TCK-2760) ; `null` pour un brouillon d'invitation. */
  readonly balance: { readonly remaining_to_pay: number; readonly as_of: string } | null;
  /** Vide, et ni brouillon, ni déjà parti, ni soi-même, ni l'hôte d'une agence individuelle. */
  readonly can_depart: boolean;
}

export interface OwnerDepartureResult {
  readonly id: number;
  readonly status: 'inactive';
  readonly departed_at: string | null;
}

export function cheminDuDepart(ownerProfileId: number): string {
  return cheminApi`/api/owners/${ownerProfileId}/departure`;
}

export async function deleteOwnerFromAgency(token: string, ownerProfileId: number): Promise<{ data: OwnerDepartureResult }> {
  return apiRequest(cheminApi`/api/owners/${ownerProfileId}`, { method: 'DELETE', token });
}
