import type { UserRole, UserStatus } from './user';

/**
 * TCK-133 — row shape for the agency-scoped users table. The backend
 * returns raw User Eloquent attributes (UserAdminController::index uses
 * `$paginator->items()`), so all fields are snake_case. Keep this list
 * aligned with `ADMIN_USERS_FIELDS` in `lib/queries/admin-users.ts`.
 *
 * TCK-278 — `roles` est désormais dérivé des profils polymorphes côté
 * backend (cf. `User::profileTypes()` / Règle 5 du models-spec). Le format
 * historique `{name}[]` reste supporté pour les vues admin détaillées
 * qui exposent un détail par-agence ; les listings utilisent l'array de
 * strings exposé via `UserResource`.
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
  roles?: Array<UserRole | { name: UserRole }>;
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
