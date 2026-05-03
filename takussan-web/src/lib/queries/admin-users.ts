import { ApiError } from '@/lib/api';
import type {
  AdminAgencyUsersResponse,
  AdminUserRoleFilter,
  AdminUserStatusFilter,
} from '@/types/admin-users';
import type { UserRole } from '@/types/user';

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
 * `roles` is *not* in this list either — it lives on a relation
 * (spatie). Use `include=roles` (TCK-147) to load it.
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
  qs.set('include', 'roles');
  if (params.search) qs.set('filter[search]', params.search);
  if (params.status) qs.set('filter[status]', params.status);
  if (params.role) qs.set('filter[role]', params.role);
  qs.set('sort', params.sort ?? '-created_at');
  qs.set('page', String(params.page ?? 1));
  qs.set('per_page', String(params.perPage ?? 20));

  const res = await fetch(`/api/admin-users?${qs.toString()}`, {
    credentials: 'include',
  });
  return jsonOrThrow<AdminAgencyUsersResponse>(res);
}

/**
 * Toggle a user's status. The backend exposes two distinct endpoints
 * (`/block` and `/activate`) rather than a PATCH — block additionally
 * revokes Sanctum tokens (TCK-147 hardening).
 */
export async function postUserAction(
  userId: number,
  action: 'block' | 'activate',
): Promise<unknown> {
  const res = await fetch(`/api/admin-users/${userId}/${action}`, {
    method: 'POST',
    credentials: 'include',
  });
  return jsonOrThrow<unknown>(res);
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
  const res = await fetch(`/api/admin-users/${userId}/role`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return jsonOrThrow<unknown>(res);
}
