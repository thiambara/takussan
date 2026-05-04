import { ApiError } from '@/lib/api';
import type {
  PermissionsCatalogueResponse,
  RoleListItem,
  RoleResponse,
  RolesListResponse,
} from '@/types/admin-roles';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/**
 * Sparse fields for the role editor. The backend already projects only
 * these columns server-side, but we still pin them via `fields[roles]=`
 * so any future server-side widening doesn't bloat the wire payload.
 *
 * `permissions` is a relation (loaded via `include=permissions`) — listing
 * it in `fields[roles]` would be rejected by spatie/laravel-query-builder.
 */
export const ADMIN_ROLES_FIELDS = [
  'id',
  'name',
  'guard_name',
  'team_id',
] as const;

export interface FetchRolesParams {
  readonly scope?: 'agency' | 'global';
  readonly includePermissions?: boolean;
}

export async function fetchRoles(params: FetchRolesParams = {}): Promise<RolesListResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[roles]', ADMIN_ROLES_FIELDS.join(','));
  if (params.includePermissions) qs.set('include', 'permissions');
  if (params.scope) qs.set('filter[scope]', params.scope);

  const res = await fetch(`/api/roles?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<RolesListResponse>(res);
}

export async function fetchPermissionsCatalogue(): Promise<PermissionsCatalogueResponse> {
  const res = await fetch('/api/permissions', { credentials: 'include' });
  return jsonOrThrow<PermissionsCatalogueResponse>(res);
}

export interface CreateRolePayload {
  readonly name: string;
  readonly permissions?: readonly string[];
}

export async function createRole(payload: CreateRolePayload): Promise<RoleListItem> {
  const res = await fetch('/api/roles', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await jsonOrThrow<RoleResponse>(res);
  return json.data;
}

export interface UpdateRolePayload {
  readonly name?: string;
  readonly permissions?: readonly string[];
}

export async function updateRole(id: number, payload: UpdateRolePayload): Promise<RoleListItem> {
  const res = await fetch(`/api/roles/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await jsonOrThrow<RoleResponse>(res);
  return json.data;
}

export async function deleteRole(id: number): Promise<void> {
  const res = await fetch(`/api/roles/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
}
