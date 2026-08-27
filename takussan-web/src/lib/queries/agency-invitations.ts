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
 * Sparse fieldset : exactement les colonnes que la section rend, plus `status`
 * (qui sert d'assertion : une ligne rendue ici est toujours `sent`).
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
};

export const agencyInvitationKeys = {
  /** Racine d'invalidation — tout geste sur une invitation la vise. */
  all: ['agency-invitations'] as const,
  pending: (agencyId: number) => ['agency-invitations', 'pending', agencyId] as const,
};

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
    // `sent` = en attente. Les `accepted` sont devenues des membres (ils sont dans
    // le tableau), les `revoked` / `expired` sont terminales.
    filter: { status: 'sent' },
    sort: '-created_at',
    page: page ?? 1,
    per_page: perPage ?? 10,
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
