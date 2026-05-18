import type { UserRole } from '@/types/user';

/**
 * TCK-278 — Le champ `roles` exposé par l'API (`UserResource`) est désormais
 * dérivé des profils polymorphes du user (cf. Règle 5 du models-spec :
 * « profil = rôle »). Le contrat HTTP est inchangé (array de strings), donc
 * les helpers ci-dessous restent valides. Pour les vues admin détaillées,
 * `UserDetailResource` expose en plus `admin_role_rows` avec `(name, team_id)`
 * où `team_id` = `agency_id` du profil polymorphe.
 */

export function isAgent(roles: UserRole[]): boolean {
  return roles.includes('agent');
}

export function isOwner(roles: UserRole[]): boolean {
  return roles.includes('owner');
}

export function isCustomer(roles: UserRole[]): boolean {
  return roles.includes('customer');
}

export function isAdmin(roles: UserRole[]): boolean {
  return roles.includes('agency_admin') || roles.includes('super_admin');
}

/**
 * TCK-270 — Strict agency_admin check (excludes super_admin so the branding
 * banner doesn't pop up when a super-admin impersonates a tenant.).
 */
export function isAgencyAdmin(roles: UserRole[]): boolean {
  return roles.includes('agency_admin');
}

export function isSuperAdmin(roles: UserRole[]): boolean {
  return roles.includes('super_admin');
}

export function isServiceProvider(roles: UserRole[]): boolean {
  return roles.includes('service_provider');
}

export function isTenant(roles: UserRole[]): boolean {
  return roles.includes('tenant');
}

export function getPrimaryRole(roles: UserRole[]): UserRole | null {
  const priority: UserRole[] = [
    'super_admin',
    'agency_admin',
    'agent',
    'owner',
    'service_provider',
    'tenant',
    'customer',
  ];
  return priority.find((r) => roles.includes(r)) ?? null;
}
