import type { UserRole, UserStatus } from './user';

/**
 * TCK-133 — row shape for the agency-scoped users table. The backend
 * returns raw User Eloquent attributes (UserAdminController::index uses
 * `$paginator->items()`), so all fields are snake_case. Keep this list
 * aligned with `ADMIN_USERS_FIELDS` in `lib/queries/admin-users.ts`.
 *
 * `roles` is shipped via `include=roles` (TCK-147 added it to
 * `User::$requestLoadable`) — each entry is a spatie role row, of which
 * we only consume `name`. `agentProfiles` / `ownerProfiles` are
 * available via the same include but the table only needs a count
 * fall-back when the user has no spatie role yet (e.g. fresh signup).
 */
export type AdminAgencyUserRow = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  roles?: { name: UserRole }[];
};

export type AdminAgencyUsersResponse = {
  data: AdminAgencyUserRow[];
  meta: {
    total: number;
    current_page: number;
    last_page?: number;
    per_page?: number;
  };
};

export type AdminUserStatusFilter = '' | 'active' | 'inactive' | 'banned';
export type AdminUserRoleFilter =
  | ''
  | 'agency_admin'
  | 'agent'
  | 'owner'
  | 'tenant'
  | 'customer'
  | 'service_provider';
