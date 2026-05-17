import type { User } from '@/types/user';

/**
 * Routes whose access requires the user's agency to be on the `standard`
 * plan. Used by the sidebar to render these entries with a padlock for
 * agency_admins still on `individual`. The pages themselves redirect to
 * `/app` server-side, which is the ultimate gate.
 */
export const PRO_ROUTES: ReadonlySet<string> = new Set([
  // /app/... — espace perso agency_admin
  '/app/team',
  '/app/overview/kpis',
  '/app/overview/alerts',
  '/app/overview/agency',
  '/app/owners',
  // /admin/... — console admin agence
  '/admin',
  '/admin/team',
  '/admin/agency/billing',
  '/admin/moderation/properties',
  '/admin/roles',
  '/admin/audit',
]);

/**
 * `true` when the user can see the entry in the sidebar but cannot use
 * it yet because the agency hasn't been upgraded. Super-admins are
 * never locked. Roles that don't see the entry at all are unaffected
 * (the item isn't pushed by `buildNavItems` in the first place).
 */
export function isProRouteLocked(
  user: User,
  agencyIsStandard: boolean | undefined,
  href: string,
): boolean {
  if (!PRO_ROUTES.has(href)) return false;
  if (user.roles.includes('super_admin')) return false;
  if (!user.roles.includes('agency_admin')) return false;
  return agencyIsStandard !== true;
}
