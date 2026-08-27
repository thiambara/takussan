import { apiRequest, buildQueryString } from '@/lib/api';
import type { PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { InvitationSummary } from '@/lib/queries/owners';

/**
 * TCK-368 — les invitations EN ATTENTE de l'agence active, pour la console Équipe.
 *
 * ## Ce module n'apporte QU'UNE lecture
 *
 * La relance et la révocation existent depuis TCK-249 et sont déjà écrites dans
 * `owners.ts` : elles sont **ré-exportées**, pas réécrites. `service-providers.ts`
 * en porte déjà une seconde copie mot pour mot (`resendInvitation` /
 * `revokeInvitation`, lignes 144 et 154) — en écrire une troisième aurait figé la
 * duplication au lieu de s'arrêter là. *Deux copies d'un appel réseau divergent le
 * jour où l'une des deux corrige un bug.*
 *
 * ## La portée vient du SERVEUR, jamais du filtre
 *
 * Aucun `filter[agency_id]` n'est envoyé, délibérément :
 * `InvitationController::visibleScope()` borne déjà la requête d'un `agency_admin`
 * à `where('agency_id', $user->agency_id)`. Un filtre côté client ne resserrerait
 * rien qui ne le soit déjà, et **suggérerait** que la portée est un choix du front
 * — alors qu'elle est la frontière d'isolation (CLAUDE.md, principe n°2).
 *
 * ## Pas d'`include=`, et c'est mesuré
 *
 * `InvitationResource::toArray()` n'émet **aucune** relation — ni `inviter`, ni
 * `agency`, ni `invitable`. Un `include=inviter` serait chargé côté serveur puis
 * jeté à la sérialisation : du coût sans effet. On ne l'envoie donc pas.
 */

export { resendInvitation, revokeInvitation } from '@/lib/queries/owners';
export type { InvitationSummary } from '@/lib/queries/owners';

/**
 * Sparse fieldset : exactement les colonnes que la section rend, plus `status`.
 *
 * ⚠ `is_expired` n'y figure pas et ne DOIT pas y figurer : ce n'est pas une
 * colonne mais un calcul de `InvitationResource` (`status = expired` OU
 * `status = sent` avec `expires_at` déjà passé). Il est servi tant que
 * `expires_at` l'est — d'où sa présence, ci-dessous, dans une liste de colonnes
 * dont la section n'affiche pourtant pas la date d'expiration.
 */
export const AGENCY_INVITATION_FIELDS = [
  'id',
  'email',
  'role',
  'status',
  'agency_id',
  'expires_at',
  'created_at',
] as const;

/**
 * `InvitationSummary` (owners.ts) ne porte pas `created_at` — la section en a
 * besoin pour dire « depuis quand ». On ÉTEND le type partagé au lieu d'en
 * déclarer un second.
 */
export type PendingAgencyInvitation = InvitationSummary & {
  readonly created_at: string | null;
  /**
   * TCK-367 — « morte » est un état, pas une nuance de « en attente ». Le
   * serveur le calcule parce que le front ne peut PAS le déduire de `status`
   * seul : le cron `invitations:expire` tourne à l'heure, et une ligne reste
   * `sent` jusqu'à une heure après sa mort.
   */
  readonly is_expired: boolean;
};

export const agencyInvitationKeys = {
  /** Racine d'invalidation — tout geste sur une invitation la vise. */
  all: ['agency-invitations'] as const,
  /**
   * La PAGE fait partie de la clé : sans elle, deux pages se partageraient une
   * seule entrée de cache et la seconde afficherait la première jusqu'au
   * refetch. `all` reste un PRÉFIXE de celle-ci, donc une invalidation à la
   * racine emporte toutes les pages — c'est ce qui fait que « inviter »
   * rafraîchit la liste quelle que soit la page regardée.
   */
  pending: (agencyId: number, page: number) =>
    ['agency-invitations', 'pending', agencyId, page] as const,
};

/**
 * Taille de page de la section. Elle est EXPORTÉE parce que la section la
 * passe explicitement : `per_page` retombait sur le défaut du serveur, et
 * au-delà de dix invitations les suivantes étaient invisibles ET
 * inactionnables, sans pagination pour les atteindre.
 */
export const DEFAULT_PER_PAGE = 10;

export interface FetchPendingAgencyInvitationsParams {
  readonly page?: number;
  readonly perPage?: number;
}

function buildParams({
  page,
  perPage,
}: FetchPendingAgencyInvitationsParams): SpatieQueryParams {
  return {
    fields: { invitations: AGENCY_INVITATION_FIELDS },
    // TCK-368 (revue) — `sent` ET `expired`.
    //
    // Ne lister que les `sent` faisait s'ÉVAPORER l'invitation périmée : le
    // cron `invitations:expire` la marquait, elle quittait l'écran sans geste
    // de l'admin, et la ré-inviter posait une SECONDE ligne (mesuré :
    // `POST /api/invitations` → 201, deux lignes pour un même courriel).
    // L'objectif du ticket est « l'admin voit son invitation TANT QU'ELLE
    // N'EST PAS ACCEPTÉE » : une invitation morte reste donc à l'écran,
    // signalée comme morte (`is_expired`), et se relance — le serveur la
    // ressuscite au lieu d'en créer une voisine.
    //
    // `accepted` (devenue un membre, elle est dans le tableau) et `revoked`
    // (annulée par un geste explicite) restent dehors : elles, l'admin les a
    // déjà vues sortir.
    filter: { status: 'sent,expired' },
    sort: '-created_at',
    page: page ?? 1,
    per_page: perPage ?? DEFAULT_PER_PAGE,
  };
}

export async function fetchPendingAgencyInvitations(
  token: string,
  params: FetchPendingAgencyInvitationsParams = {},
): Promise<PaginatedResponse<PendingAgencyInvitation>> {
  const qs = buildQueryString(buildParams(params));
  return apiRequest<PaginatedResponse<PendingAgencyInvitation>>(
    `/api/invitations${qs ? `?${qs}` : ''}`,
    { token },
  );
}
