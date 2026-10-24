import { ApiError } from '@/lib/api';
import type {
  AdminAgencyUsersResponse,
  AdminUserRoleFilter,
  AdminUserStatusFilter,
} from '@/types/admin-users';
import type { UserRole } from '@/types/user';
import { cheminApi } from '@/lib/chemin-api';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/**
 * TCK-133 — sparse fields for the agency-scoped users table.
 *
 * `full_name` is derived on the client (`first_name + last_name`) — it is
 * an Eloquent accessor, not a DB column, so listing it in
 * `fields[users]` would fail with HTTP 400 (`InvalidFieldQuery`) against
 * the canonical `User::$queryFields` whitelist.
 *
 * `roles` is *not* in this list either, and `/api/users` does NOT return it
 * (TCK-2008, P176.06 — mesuré le 2026-10-23) : with `fields[users]`,
 * `UserAdminController::index` serialises the models themselves, not
 * `UserResource`, so a row carries only these columns, `two_factor_enabled`
 * and the profiles asked by `include=…` below (`agent_profiles`,
 * `owner_profiles`, `agency_admin_profiles`, bounded to the active agency by
 * TCK-665). A row's role is to be read from those profiles or from
 * `role_assignments`, never from `row.roles`, which stays undefined here.
 */
export const ADMIN_USERS_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'phone',
  'status',
  'last_login_at',
  'created_at',
] as const;

export interface FetchAdminUsersParams {
  readonly search?: string;
  readonly status?: AdminUserStatusFilter;
  readonly role?: AdminUserRoleFilter;
  readonly sort?: string;
  readonly page?: number;
  readonly perPage?: number;
}

export async function fetchAdminUsers(
  params: FetchAdminUsersParams = {},
): Promise<AdminAgencyUsersResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[users]', ADMIN_USERS_FIELDS.join(','));
  // TCK-665 — sans `platformProfile` : l'API le refuse hors de la console super-admin (400).
  qs.set('include', 'agentProfiles,ownerProfiles,agencyAdminProfiles');
  if (params.search) qs.set('filter[search]', params.search);
  if (params.status) qs.set('filter[status]', params.status);
  if (params.role) qs.set('filter[role]', params.role);
  qs.set('sort', params.sort ?? '-created_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));
  // TCK-1770 (P136.04) — les affectations de rôle de la page, dans la même réponse.
  qs.set('with_role_assignments', '1');

  const res = await fetch(cheminApi`/api/admin-users?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyUsersResponse>(res);
}

/**
 * Replace the user's role(s) with the single role provided. Backed by
 * `PUT /api/users/{user}/role` (TCK-014, syncRoles semantics). Returns
 * 422 if the target user has no resolvable agency context, or 403 with
 * `messages.target_user_not_in_active_agency` if the target sits in a
 * different agency than the actor (TCK-147).
 */
export async function putUserRole(
  userId: number,
  role: UserRole,
): Promise<unknown> {
  const res = await fetch(cheminApi`/api/admin-users/${userId}/role`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return jsonOrThrow<unknown>(res);
}
