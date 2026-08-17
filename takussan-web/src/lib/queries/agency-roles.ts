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
};

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
    { invalidate: [agencyRoleKeys.all, agencyRoleKeys.detail(agencyId, roleId)] },
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
    { invalidate: [agencyRoleKeys.all, ['team']] },
  );
}
