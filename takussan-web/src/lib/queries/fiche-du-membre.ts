import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';

/**
 * TCK-2928 — la fiche d'un membre de l'équipe (`GET /api/agencies/{agency}/team/{user}`, TCK-2926,
 * ADR-0124) et le rappel de sa double authentification (`POST …/two-factor-reminder`).
 *
 * Chaque compte se lit sur la liste vers laquelle la fiche renvoie, avec la même règle côté API :
 * `portfolio.properties` ↔ `filter[agent]` des biens, `portfolio.active_customers` ↔
 * `filter[referent]={id}` des clients (voir {@link lienDesBiensDuMembre}, {@link lienDesClientsDuMembre}).
 */
export interface FicheDuMembreApi {
  readonly user_id: number;
  readonly portfolio: {
    /** Par statut réel (`rented`, `available`, `draft`…), archivés exclus. */
    readonly properties: Readonly<Record<string, number>>;
    readonly properties_total: number;
    readonly active_customers: number;
    readonly visits_this_week: number;
  };
  readonly commissions_due: {
    readonly amount: number;
    readonly leases: number;
    /** Date calendaire (jour de Dakar) de la plus ancienne ligne due, `null` sans dû. */
    readonly oldest_due_at: string | null;
  };
  readonly last_login: {
    readonly at: string | null;
    /** Famille d'appareil (`iPhone · Safari`), jamais l'agent brut ni l'IP. */
    readonly device: string | null;
    readonly city: string | null;
  };
  readonly two_factor_enabled: boolean;
  readonly two_factor_enabled_at: string | null;
}

export const ficheDuMembreKeys = {
  fiche: (agencyId: number, userId: number) => ['team-member-sheet', agencyId, userId] as const,
};

export async function fetchFicheDuMembre(token: string, agencyId: number, userId: number): Promise<FicheDuMembreApi> {
  const res = await apiRequest<ApiResponse<FicheDuMembreApi>>(cheminApi`/api/agencies/${agencyId}/team/${userId}`, { token });
  return res.data;
}

/** 409 : la 2FA est déjà active ; 429 : un rappel est parti dans les 24 h. */
export async function rappelerLaDoubleAuthentification(token: string, agencyId: number, userId: number): Promise<void> {
  await apiRequest<ApiResponse<{ sent: boolean }>>(cheminApi`/api/agencies/${agencyId}/team/${userId}/two-factor-reminder`, {
    token,
    method: 'POST',
  });
}

/** Les statuts comptés « à louer ou à vendre » (sur le marché), à côté de « en location » (`rented`). */
export const STATUTS_SUR_LE_MARCHE = ['available', 'published'] as const;

/** La liste des biens filtrée côté serveur sur ce membre (`?agent=` → `filter[agent]`). */
export function lienDesBiensDuMembre(userId: number): string {
  return `/app/properties?agent=${userId}`;
}

/** La liste des clients filtrée côté serveur sur ce référent (`?referent=` → `filter[referent]`). */
export function lienDesClientsDuMembre(userId: number): string {
  return `/app/customers?referent=${userId}`;
}
