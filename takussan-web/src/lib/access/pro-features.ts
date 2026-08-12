import type { User } from '@/types/user';

/**
 * Routes whose access requires the user's agency to be on the `standard`
 * plan. Used by the sidebar to render these entries with a padlock for
 * agency_admins still on `individual`.
 *
 * ⚠️ Ce docblock affirmait : « the pages themselves redirect to `/app`
 * server-side, which is the ultimate gate ». **Mesuré le 2026-08-12 : c'est
 * vrai pour 5 de ces 9 routes.** Les quatre routes `/app/*` n'appellent PAS
 * `ensureStandardAgencyOrRedirect` — pour elles, le cadenas n'empêche que le
 * clic, et une URL tapée à la main passe. Suivi par **TCK-284** ; l'arbitrage
 * n'est pas mécanique (la garde SSR vise tout porteur d'`agency_id`, alors que
 * le cadenas ci-dessous ne vise que les `agency_admin` — les deux règles n'ont
 * pas le même périmètre).
 *
 * `scripts/check-pro-routes.mjs` mesure l'écart à chaque CI et le refusera dès
 * qu'une route neuve arrive sans garde. Les quatre écarts connus y sont
 * nommés — une allowlist est une dette datée, pas une exemption.
 */
export const PRO_ROUTES: ReadonlySet<string> = new Set([
  // /app/... — espace perso agency_admin
  '/app/overview/kpis',
  '/app/overview/alerts',
  '/app/overview/agency',
  '/app/owners',
  // /admin/... — console admin agence
  '/admin',
  '/admin/team',
  '/admin/agency/billing',
  '/admin/moderation/properties',
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
