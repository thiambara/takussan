'use client';

/**
 * TCK-369 — les trois endpoints de délégation temporaire, livrés par TCK-108.
 *
 * ```
 * GET    /api/agencies/{agency}/role-delegations
 * POST   /api/agencies/{agency}/role-delegations
 * DELETE /api/agencies/{agency}/role-delegations/{delegation}
 * ```
 *
 * ⚠️ Les chemins portent `/api` : `useApiQuery` / `useApiMutation` ne
 * l'ajoutent pas (seul `apiFetch` le fait). L'oublier rend un
 * `net::ERR_FAILED` par CORS, pas un 404 lisible.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUN `fields[…]`, AUCUN `include=`, AUCUN `sort=` ICI
 * ────────────────────────────────────────────────────────────────────────
 *
 * La règle du dépôt — « sparse fieldsets obligatoires » — suppose que
 * l'endpoint les DÉCLARE. `RoleDelegationController::index` construit son
 * `QueryBuilder` avec `allowedFilters(status, user_id)` et
 * `defaultSort('-created_at')`, **et rien d'autre** : pas d'`allowedFields`,
 * pas d'`allowedIncludes`, pas d'`allowedSorts`.
 *
 * ⚠️ **Et spatie ne REFUSE alors rien : il ignore.** `ensureAllFieldsExist()`
 * et `ensureAllSortsExist()` ne sont appelées que depuis `allowedFields()` et
 * `allowedSorts()` ; jamais appelées, jamais exécutées. Mesuré le 2026-08-27
 * en interrogeant l'endpoint : `fields[]`, `sort=` et `include=` rendent tous
 * **200**. Une première version de ce commentaire annonçait un 400 — c'était
 * une déduction, et elle était fausse.
 *
 * **Le vrai coût est pire qu'un 400, parce qu'il est silencieux.** Mesuré sur
 * trois délégations de dates distinctes :
 *
 * ```
 * GET …/role-delegations                  → ids 3,2,1   (le -created_at du contrôleur)
 * GET …/role-delegations?sort=-created_at → ids 1,2,3   ← l'ordre est PERDU
 * GET …/role-delegations?fields[…]=id     → 19 clés     ← le champ est IGNORÉ
 * ```
 *
 * `defaultSorts()` sort en tête dès que la requête porte un `sort=`, et
 * `addRequestedSortsToQuery()` ne trouve alors aucun tri autorisé à appliquer.
 * **Écrire le tri « par convention » revient donc à dé-trier la liste** — sans
 * erreur, sans avertissement. Et un `fields[]` accepté puis ignoré donne
 * l'illusion d'un sparse fieldset là où l'on télécharge la ressource entière.
 *
 * Les relations `user` / `delegator` / `revokedBy` sont eager-loadées par le
 * contrôleur lui-même : elles arrivent sans qu'on les demande.
 *
 * Élargir le contrat serait du backend, et TCK-369 l'exclut explicitement.
 */

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { AGENCY_MEMBER_FIELDS } from '@/lib/queries/agency-members';
import type { PaginatedResponse, ApiResponse } from '@/types/api';
import type { User } from '@/types/user';
import type { CreateRoleDelegationInput, RoleDelegation } from '@/types/role-delegation';

export const roleDelegationKeys = {
  all: ['role-delegations'] as const,
  list: (agencyId: number) => ['role-delegations', 'list', agencyId] as const,
  candidates: (agencyId: number) => ['role-delegations', 'candidates', agencyId] as const,
};

/**
 * Les capacités du BÉNÉFICIAIRE changent à la création comme à la révocation.
 * Ce n'est pas la session courante qui les lit — l'administrateur délègue à
 * quelqu'un d'autre, l'auto-délégation étant refusée en 422 — mais le même
 * navigateur peut porter les deux sessions dans le temps, et le cache de
 * `['me','capabilities']` a 5 minutes de `staleTime`. L'invalider coûte une
 * requête et évite un écran qui ment pendant cinq minutes.
 *
 * Écrite en littéral plutôt qu'importée de `@/hooks/useCan` — même raison que
 * dans `agency-roles.ts` : un module de requêtes n'a pas à dépendre d'un hook,
 * et l'importer coince chaque test qui double `@/hooks/useCan` en l'obligeant
 * à réexporter une constante dont le composant sous test n'a que faire.
 */
const ME_CAPABILITY_KEY = ['me', 'capabilities'] as const;

/** `GET /api/agencies/{agency}/role-delegations` — les quatre statuts, sans filtre. */
export function useRoleDelegations(agencyId: number, enabled = true) {
  return useApiQuery<PaginatedResponse<RoleDelegation>>(
    roleDelegationKeys.list(agencyId),
    `/api/agencies/${agencyId}/role-delegations`,
    {
      enabled: enabled && Number.isFinite(agencyId) && agencyId > 0,
      // Pas de `filter[status]` : l'écran montre l'HISTORIQUE autant que
      // l'actif — une délégation expirée « s'efface sans disparaître ».
      // Filtrer côté serveur pour re-fusionner côté client ferait quatre
      // requêtes pour une liste.
      params: { per_page: 100 },
    },
  );
}

/**
 * `POST /api/agencies/{agency}/role-delegations`.
 *
 * ⚠️ **Le statut de la délégation créée n'est pas décidé ici, et pas
 * davantage `scheduled` par défaut.** `RoleDelegationService::create` pose
 * `Active` dès que `starts_at` est nul ou déjà passé, `Scheduled` sinon. La
 * réponse 201 porte le statut réel : c'est elle qui fait foi, jamais une
 * supposition de l'appelant.
 */
export function useCreateRoleDelegation(agencyId: number) {
  return useApiMutation<ApiResponse<RoleDelegation>, CreateRoleDelegationInput>(
    { path: `/api/agencies/${agencyId}/role-delegations`, method: 'POST' },
    { invalidate: [roleDelegationKeys.list(agencyId), ME_CAPABILITY_KEY] },
  );
}

/**
 * `DELETE /api/agencies/{agency}/role-delegations/{delegation}`.
 *
 * ⚠️ **Ce DELETE ne supprime rien.** Il rend **200 avec la délégation**, dont
 * le `status` est passé à `revoked` — la ligne reste en base, avec
 * `revoked_at` et `revoked_by`. Traiter la réponse comme un 204 et retirer la
 * ligne de l'affichage effacerait la trace d'audit que le backend a pris soin
 * de garder.
 *
 * Il est aussi **idempotent** : révoquer une délégation déjà `revoked` ou
 * `expired` rend 200 sans rien changer (`RoleDelegationService::revoke` sort
 * en tête). Deux administrateurs qui cliquent en même temps ne produisent
 * donc pas d'erreur — le second voit simplement l'état du premier.
 */
export function useRevokeRoleDelegation(agencyId: number) {
  return useApiMutation<ApiResponse<RoleDelegation>, number>(
    {
      path: (delegationId) => `/api/agencies/${agencyId}/role-delegations/${delegationId}`,
      method: 'DELETE',
    },
    { invalidate: [roleDelegationKeys.list(agencyId), ME_CAPABILITY_KEY] },
  );
}

/**
 * Les membres à qui une délégation peut être accordée.
 *
 * `GET /api/agencies/{agency}/members` rend exactement les utilisateurs
 * portant un profil `agent` ou `owner` dans l'agence — c'est mot pour mot la
 * condition que `RoleDelegationService::create` vérifie avant d'accepter un
 * bénéficiaire (`isAgentAt || isOwnerAt`). Proposer une autre source
 * offrirait des noms dont on connaît déjà le 422.
 *
 * ## Pourquoi ce hook vit ici et non dans `agency-members.ts`
 *
 * Ce module-là n'expose que des fonctions `apiRequest` à jeton explicite,
 * appelées depuis le serveur ; il ne contient **aucun hook**. Y poser le
 * premier en ferait un module client à moitié, et `AGENCY_MEMBER_FIELDS` —
 * la seule chose dont on a besoin — s'importe très bien.
 */
export function useDelegationCandidates(agencyId: number, enabled = true) {
  return useApiQuery<PaginatedResponse<User>>(
    roleDelegationKeys.candidates(agencyId),
    `/api/agencies/${agencyId}/members`,
    {
      enabled: enabled && Number.isFinite(agencyId) && agencyId > 0,
      params: {
        fields: { users: [...AGENCY_MEMBER_FIELDS] },
        sort: 'first_name',
        per_page: 100,
      },
    },
  );
}
