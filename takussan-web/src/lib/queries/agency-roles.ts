'use client';

/**
 * TCK-279 — rôles personnalisés d'une agence.
 *
 * Toutes les lectures passent par `useApiQuery`, qui sérialise les paramètres
 * spatie (`fields[]`, `filter[]`, `include=`, `sort=`) — cf.
 * `docs/spatie-query-builder.md`.
 *
 * ⚠️ Les chemins portent `/api` : `useApiQuery`/`useApiMutation` ne l'ajoutent
 * pas. L'oublier rend un `net::ERR_FAILED` par CORS, pas un 404 lisible.
 */

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  AgencyRole,
  AgencyRoleAssignment,
  AssignAgencyRoleInput,
  CapabilityValue,
  CreateAgencyRoleInput,
  UpdateAgencyRoleInput,
} from '@/types/agency-role';

export const agencyRoleKeys = {
  all: ['agency-roles'] as const,
  list: (agencyId: number) => ['agency-roles', 'list', agencyId] as const,
  detail: (agencyId: number, roleId: number) =>
    ['agency-roles', 'detail', agencyId, roleId] as const,
  assignments: (agencyId: number, userIds: readonly number[]) =>
    ['agency-roles', 'assignments', agencyId, [...userIds].sort((a, b) => a - b)] as const,
};

/**
 * Les capacités de l'utilisateur COURANT changent quand un rôle change ou
 * qu'un profil est réaffecté — celui qui édite peut être celui qui perd un
 * bouton. `useCan` lit `['me','capabilities']` ; sans cette clé dans les
 * invalidations, l'interface resterait sur son ancien verdict jusqu'au
 * prochain `staleTime` de 5 minutes.
 *
 * Écrit ici en littéral plutôt qu'importé de `@/hooks/useCan` : ce module
 * n'a aucune autre raison de dépendre d'un hook, et l'inverse créerait un
 * cycle avec les invalidations que `useCan` documente.
 */
const ME_CAPABILITY_KEY = ['me', 'capabilities'] as const;

/**
 * Sparse fieldset de la liste — obligatoire (principe non négociable côté
 * front). `capabilities` vient de l'`include`, pas de `fields`.
 */
const LIST_FIELDS = [
  'id',
  'agency_id',
  'name',
  'base_profile_type',
  'description',
  'is_system',
  'is_clonable',
] as const;

/** `GET /api/agencies/{agency}/roles` */
export function useAgencyRoles(agencyId: number, enabled = true) {
  return useApiQuery<PaginatedResponse<AgencyRole>>(
    agencyRoleKeys.list(agencyId),
    `/api/agencies/${agencyId}/roles`,
    {
      enabled: enabled && Number.isFinite(agencyId) && agencyId > 0,
      params: {
        fields: { agency_roles: [...LIST_FIELDS] },
        include: ['capabilities'],
        sort: 'name',
        per_page: 100,
      },
    },
  );
}

/** `GET /api/agencies/{agency}/roles/{role}` */
export function useAgencyRole(agencyId: number, roleId: number, enabled = true) {
  return useApiQuery<ApiResponse<AgencyRole>>(
    agencyRoleKeys.detail(agencyId, roleId),
    `/api/agencies/${agencyId}/roles/${roleId}`,
    { enabled: enabled && roleId > 0, params: { include: ['capabilities'] } },
  );
}

/**
 * `GET /api/agencies/{agency}/role-assignments` — quel rôle porte le profil
 * de chacun des utilisateurs listés, DANS cette agence.
 *
 * `user_ids` est obligatoire côté serveur : la question « quels sont tous les
 * profils de l'agence » n'a pas de réponse bornée, et une troncature
 * silencieuse afficherait « — » à des membres qui ont bien un rôle.
 * L'appelant demande donc exactement les lignes qu'il affiche.
 *
 * ⚠️ La liste voyage via `extra`, donc SÉRIALISÉE EN VIRGULES
 * (`?user_ids=3,7`) — `buildQueryString` applique `String(value)` sur chaque
 * valeur d'`extra`, il ne sait pas produire de `user_ids[]=`. Le contrôleur
 * découpe. Passer par un `filter[…]` aurait été un abus : ce n'est pas un
 * filtre spatie sur un modèle listé, c'est l'argument de la question.
 */
export function useAgencyRoleAssignments(agencyId: number, userIds: readonly number[]) {
  return useApiQuery<ApiResponse<AgencyRoleAssignment[]>>(
    agencyRoleKeys.assignments(agencyId, userIds),
    `/api/agencies/${agencyId}/role-assignments`,
    {
      enabled: Number.isFinite(agencyId) && agencyId > 0 && userIds.length > 0,
      params: { extra: { user_ids: userIds.join(',') } },
      staleTime: 15_000,
    },
  );
}

/** `POST /api/agencies/{agency}/roles` — création, éventuellement par clonage. */
export function useCreateAgencyRole(agencyId: number) {
  return useApiMutation<ApiResponse<AgencyRole>, CreateAgencyRoleInput>(
    { path: `/api/agencies/${agencyId}/roles`, method: 'POST' },
    { invalidate: [agencyRoleKeys.all] },
  );
}

/**
 * `PATCH /api/agencies/{agency}/roles/{role}` — nom, description, clonabilité.
 *
 * `base_profile_type` n'est délibérément pas modifiable : le changer
 * réaffecterait en silence des profils d'un type à un autre.
 */
export function useUpdateAgencyRole(agencyId: number, roleId: number) {
  return useApiMutation<ApiResponse<AgencyRole>, UpdateAgencyRoleInput>(
    { path: `/api/agencies/${agencyId}/roles/${roleId}`, method: 'PATCH' },
    { invalidate: [agencyRoleKeys.all, agencyRoleKeys.detail(agencyId, roleId)] },
  );
}

/**
 * `DELETE /api/agencies/{agency}/roles/{role}`.
 *
 * Rend **409** avec la liste des profils en cause quand le rôle est encore
 * porté — l'appelant doit traiter ce cas, ce n'est pas une erreur inattendue
 * mais une réponse prévue par la spec (AC5).
 */
export function useDeleteAgencyRole(agencyId: number) {
  return useApiMutation<{ message: string }, number>(
    {
      path: (roleId) => `/api/agencies/${agencyId}/roles/${roleId}`,
      method: 'DELETE',
    },
    { invalidate: [agencyRoleKeys.all] },
  );
}

/**
 * `PUT /api/agencies/{agency}/roles/{role}/capabilities` — remplace
 * l'ENSEMBLE des capacités. Une capacité absente de la liste est retirée.
 *
 * Un tableau vide est légitime (vider un rôle) ; l'API attend `present`, pas
 * `required`.
 */
export function useSyncRoleCapabilities(agencyId: number, roleId: number) {
  return useApiMutation<ApiResponse<AgencyRole>, { capabilities: CapabilityValue[] }>(
    {
      path: `/api/agencies/${agencyId}/roles/${roleId}/capabilities`,
      method: 'PUT',
    },
    {
      invalidate: [
        agencyRoleKeys.all,
        agencyRoleKeys.detail(agencyId, roleId),
        ME_CAPABILITY_KEY,
      ],
    },
  );
}

/**
 * `PATCH /api/profiles/{profile}/agency-role` — réaffecte un profil.
 *
 * ⚠️ `profile_type` voyage dans le CORPS, pas dans l'URL : un id nu ne
 * désigne pas un profil polymorphe. Refusé si le rôle cible n'est pas du même
 * `base_profile_type`, ou s'il retirerait `team.assign_role` au dernier
 * administrateur de l'agence (422 avec un message dédié).
 */
export function useAssignAgencyRole(profileId: number) {
  return useApiMutation<ApiResponse<unknown>, AssignAgencyRoleInput>(
    { path: `/api/profiles/${profileId}/agency-role`, method: 'PATCH' },
    { invalidate: [agencyRoleKeys.all, ['admin-users'], ME_CAPABILITY_KEY] },
  );
}
