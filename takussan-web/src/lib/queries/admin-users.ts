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
  /** Un rôle, ou plusieurs lus en OU (`agent,agency_admin` : le personnel, TCK-2665). */
  readonly role?: AdminUserRoleFilter | 'agent,agency_admin';
  /** TCK-2667 — la pastille « Absents » : les membres qu'une absence remplace (`filter[absent]=1`). */
  readonly absent?: boolean;
  /**
   * `filter[assignable]=1` — le personnel EN EXERCICE dans l'agence (profil d'agent ou d'admin actif,
   * compte joignable) : ce que l'API accepte comme remplaçant d'une absence (`PersonnelDeLAgence`).
   * `filter[status]=active` ne juge que le COMPTE : un membre suspendu dans l'agence y reste.
   */
  readonly assignable?: boolean;
  /** TCK-2665 — `include=team_summary` : biens suivis, commissions dues, absence, arrivée. */
  readonly resume?: boolean;
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
  qs.set('include', ['agentProfiles', 'ownerProfiles', 'agencyAdminProfiles', ...(params.resume ? ['team_summary'] : [])].join(','));
  if (params.search) qs.set('filter[search]', params.search);
  if (params.status) qs.set('filter[status]', params.status);
  if (params.role) qs.set('filter[role]', params.role);
  if (params.absent) qs.set('filter[absent]', '1');
  if (params.assignable) qs.set('filter[assignable]', '1');
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

/**
 * TCK-2670 — « N membres sur M ne l'ont pas activée », sous la double authentification obligatoire de
 * la fiche de l'agence. La liste de l'équipe (`/api/admin-users`, celle de `/app/agency/team`), une
 * seule page de cent membres au plus, ids seuls : `two_factor_enabled` y est toujours calculé
 * (`UserAdminController::index`). Au-delà de cent, `lus` < `total` et l'écran dit « au moins ».
 * `filter[assignable]=1` la réduit au personnel EN EXERCICE (profil d'agent ou d'admin actif, ou
 * délégation active ; compte ni bloqué ni supprimé) : ceux à qui l'agence exige la 2FA
 * (`TwoFactorRequirement`, jamais un bailleur). Sans lui, la démo comptait 24 membres, bailleurs et
 * suspendus compris, pour 11 en exercice (TCK-2670, d1).
 * Un membre sans la clé n'est pas compté comme « sans » : un champ absent n'est pas un `false`.
 */
export interface DoubleFacteurDeLEquipe {
  readonly sans: number;
  readonly lus: number;
  readonly total: number;
}

export const DOUBLE_FACTEUR_DE_L_EQUIPE_KEY = ['admin-users', 'double-facteur'] as const;

export async function fetchDoubleFacteurDeLEquipe(): Promise<DoubleFacteurDeLEquipe> {
  const qs = new URLSearchParams();
  qs.set('fields[users]', 'id');
  qs.set('filter[assignable]', '1');
  qs.set('per_page', '100');
  qs.set('page', '1');
  const res = await fetch(cheminApi`/api/admin-users?${qs.toString()}`, { credentials: 'include' });
  const page = await jsonOrThrow<AdminAgencyUsersResponse>(res);
  return {
    sans: page.data.filter((membre) => membre.two_factor_enabled === false).length,
    lus: page.data.length,
    total: page.meta.total,
  };
}
