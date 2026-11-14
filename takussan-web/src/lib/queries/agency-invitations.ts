import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { InvitationSummary } from '@/lib/queries/owners';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * TCK-368 — les invitations EN ATTENTE de l'agence active, pour la console Équipe.
 *
 * ## Ce module apporte une lecture, et depuis TCK-392 un envoi
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
export const AGENCY_INVITATION_FIELDS = ['id', 'email', 'phone', 'role', 'status', 'agency_id', 'expires_at', 'created_at'] as const;

/**
 * `InvitationSummary` (owners.ts) ne porte pas `created_at` — la section en a
 * besoin pour dire « depuis quand ». On ÉTEND le type partagé au lieu d'en
 * déclarer un second.
 */
export type PendingAgencyInvitation = Omit<InvitationSummary, 'email'> & {
  /** Nul pour une invitation partie par SMS (connexion par téléphone, TCK-589) : `phone` la nomme. */
  readonly email: string | null;
  readonly phone?: string | null;
  readonly created_at: string | null;
  /**
   * TCK-367 — « morte » est un état, pas une nuance de « en attente ». Le
   * serveur le calcule parce que le front ne peut PAS le déduire de `status`
   * seul : le cron `invitations:expire` tourne à l'heure, et une ligne reste
   * `sent` jusqu'à une heure après sa mort.
   */
  readonly is_expired: boolean;
  /**
   * Vérification de TCK-2668 (D1) — les gestes que `InvitationPolicy` accorde à l'appelant. Servis
   * pour une invitation née d'une fiche client, et seulement quand la sélection porte ce que la règle
   * lit ({@link CHAMPS_DE_L_INVITATION_DU_CLIENT}) : absents, la fiche n'offre aucun geste.
   */
  readonly abilities?: { readonly resend?: boolean; readonly revoke?: boolean };
};

/**
 * Vérification de TCK-2668 (D1) — l'agent qui a invité SON client relance et annule cette invitation
 * sans `team.invite` (`InvitationPolicy`) : la règle lit l'émetteur et la cible, que la lecture de la
 * fiche demande donc, pour que l'API serve `abilities`.
 */
export const CHAMPS_DE_L_INVITATION_DU_CLIENT = [...AGENCY_INVITATION_FIELDS, 'invited_by', 'invitable_type', 'invitable_id'] as const;

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
  pending: (agencyId: number, page: number) => ['agency-invitations', 'pending', agencyId, page] as const,
  /** TCK-2668 — une des deux listes de l'écran des invitations (`sent` ou `expired`), par page. */
  liste: (agencyId: number, statut: string, page: number, perPage: number) =>
    ['agency-invitations', 'liste', agencyId, statut, page, perPage] as const,
  /** TCK-2668 — l'invitation d'un client à créer son compte, sur sa fiche. */
  duClient: (customerId: number) => ['agency-invitations', 'client', customerId] as const,
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
  /**
   * TCK-2668 — `sent` (en cours) ou `expired` ; sans lui, les deux (`STATUTS_INVITATION_SANS_REPONSE`).
   * Vérification de TCK-2668 (D6) — au sens de la purge, par `filter[expired]` : voir `filtreDuStatut`.
   */
  readonly statut?: 'sent' | 'expired';
}

/**
 * TCK-1517 (P167.06) — les statuts d'une invitation « sans réponse » : celles que la section des
 * invitations de `/app/agency/team` liste (voir `buildParams`), et que la file « Invitations sans
 * réponse » de l'aperçu d'agence compte (`fetchPendingInvitationsCount`). Une seule constante, pour
 * que le nombre et la liste qu'il ouvre ne se contredisent pas.
 */
export const STATUTS_INVITATION_SANS_REPONSE = 'sent,expired';

/**
 * TCK-2668 — les rôles que l'écran Équipe suit : tout sauf `tenant`. Les invitations de locataires
 * se suivent sur la fiche du client (`InviterACreerSonCompte`), et la page Équipe n'en montre plus
 * — vingt-sept invitations de locataires expirées masquaient l'unique invitation d'équipe.
 *
 * UNE constante pour la liste, ses comptes (onglet, sous-titre, renvoi du téléphone), la purge
 * « Tout effacer » et la file de l'aperçu d'agence : le nombre affiché, la liste qu'il ouvre et ce
 * que la purge efface ne peuvent pas se contredire. Les bailleurs y restent (décision 2 : leur
 * invitation se suit encore ici), les rôles d'agent retirés aussi (P234.01 : des invitations
 * anciennes en portent).
 */
export const ROLES_D_EQUIPE = 'owner,agent,agent_senior,agent_manager,agency_admin,service_provider';

/**
 * Vérification de TCK-2668 (D6) — « expirée » au sens de la purge (`filter[expired]`, API) et non de la
 * seule colonne `status` : une invitation `sent` dont l'échéance est passée, que le balayage horaire
 * n'a pas encore marquée, est expirée — `is_expired`, et « Tout effacer » l'efface. Filtrée par
 * `status=expired`, elle restait sous « En cours » et le nombre annoncé était inférieur à ce qui partait.
 */
function filtreDuStatut(statut: FetchPendingAgencyInvitationsParams['statut']): Record<string, string> {
  if (statut === 'sent') return { status: 'sent', expired: '0' };
  if (statut === 'expired') return { status: STATUTS_INVITATION_SANS_REPONSE, expired: '1' };
  return { status: STATUTS_INVITATION_SANS_REPONSE };
}

function buildParams({ page, perPage, statut }: FetchPendingAgencyInvitationsParams): SpatieQueryParams {
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
    filter: { ...filtreDuStatut(statut), role: ROLES_D_EQUIPE },
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
    cheminApi`/api/invitations${requete(qs)}`,
    { token },
  );
}

/**
 * TCK-392 — l'invitation d'un agent PAR E-MAIL, câblée sur
 * `POST /api/agencies/{agency}/agents/invite`.
 *
 * Cet endpoint existait depuis TCK-258 — avec son service, sa policy, son garde
 * `kind=individual`, son profil `draft`, son mail et ses tests — et
 * `grep -rn "agents/invite" src` ne rendait **aucun résultat** : il n'avait pas
 * un seul appelant. Le bouton « Inviter » de `/app/agency/team` appelait
 * `POST /api/agencies/{id}/members`, qui exigeait un `User` DÉJÀ INSCRIT et n'écrivait
 * aucune ligne `invitations`. *Un endpoint sans appelant et un bouton qui ment
 * sur ce qu'il fait sont le même défaut vu des deux bouts.*
 *
 * TCK-2365 (P242.01) — cette route est retirée : l'invitation est le seul chemin d'entrée dans
 * l'équipe, au rôle `agent` ou `agency_admin` (`AgentInvitationService::ALLOWED_ROLES`). Inviter un
 * administrateur exige `team.assign_role` côté API.
 */
export interface InviteAgencyAgentPayload {
  readonly email: string;
  /**
   * P234.01 (TCK-2280) — ni `agent_senior` ni `agent_manager`, jamais appliqués. TCK-2365 —
   * `agency_admin` : l'acceptation crée aussi le profil d'administrateur.
   */
  readonly role: 'agent' | 'agency_admin';
  readonly first_name: string;
  readonly last_name: string;
  readonly phone?: string | null;
}

export async function inviteAgencyAgent(
  agencyId: number,
  payload: InviteAgencyAgentPayload,
  token: string,
): Promise<ApiResponse<InvitationSummary>> {
  return apiRequest<ApiResponse<InvitationSummary>>(
    cheminApi`/api/agencies/${agencyId}/agents/invite`,
    { method: 'POST', body: payload, token },
  );
}

/**
 * TCK-2668 — « Tout effacer » : les invitations expirées de l'agence, des rôles suivis par l'Équipe
 * seulement (`DELETE /api/invitations/expired`, TCK-2665). L'API compte aussi les `sent` dont
 * l'échéance est passée et que le cron n'a pas encore marquées : le nombre effacé est le sien.
 */
export async function purgeExpiredAgencyInvitations(token: string): Promise<number> {
  const qs = buildQueryString({ filter: { role: ROLES_D_EQUIPE } });
  const res = await apiRequest<{ deleted: number }>(cheminApi`/api/invitations/expired${requete(qs)}`, {
    method: 'DELETE',
    token,
  });
  return res.deleted;
}

/**
 * TCK-2668 — la dernière invitation SANS RÉPONSE d'un client à créer son compte (`role=tenant`, née de
 * sa fiche : `filter[customer_id]`, TCK-2665). L'API borne la lecture comme la liste : l'agence pour
 * qui tient `team.invite`, sinon les invitations qu'on a soi-même envoyées.
 */
export async function fetchInvitationDuClient(token: string, customerId: number): Promise<PendingAgencyInvitation | null> {
  const qs = buildQueryString({
    fields: { invitations: CHAMPS_DE_L_INVITATION_DU_CLIENT },
    filter: { customer_id: customerId, role: 'tenant', status: STATUTS_INVITATION_SANS_REPONSE },
    sort: '-created_at',
    per_page: 1,
  });
  const res = await apiRequest<PaginatedResponse<PendingAgencyInvitation>>(cheminApi`/api/invitations${requete(qs)}`, { token });
  return res.data[0] ?? null;
}
