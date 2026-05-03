'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRole,
  deleteRole,
  fetchPermissionsCatalogue,
  fetchRoles,
  updateRole,
  type CreateRolePayload,
  type UpdateRolePayload,
} from '@/lib/queries/admin-roles';
import { ApiError } from '@/lib/api';
import type {
  PermissionsCatalogueResponse,
  RoleListItem,
  RolesListResponse,
} from '@/types/admin-roles';

export const adminRolesKeys = {
  list: ['roles'] as const,
  permissions: ['permissions'] as const,
};

export function useRolesQuery() {
  return useQuery<RolesListResponse, ApiError>({
    queryKey: adminRolesKeys.list,
    queryFn: () => fetchRoles({ includePermissions: true }),
    staleTime: 30_000,
  });
}

export function usePermissionsCatalogueQuery() {
  return useQuery<PermissionsCatalogueResponse, ApiError>({
    queryKey: adminRolesKeys.permissions,
    queryFn: fetchPermissionsCatalogue,
    staleTime: 5 * 60_000,
  });
}

export function useCreateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation<RoleListItem, ApiError, CreateRolePayload>({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRolesKeys.list });
    },
  });
}

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation<RoleListItem, ApiError, { id: number; payload: UpdateRolePayload }>({
    mutationFn: ({ id, payload }) => updateRole(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRolesKeys.list });
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminRolesKeys.list });
    },
  });
}
