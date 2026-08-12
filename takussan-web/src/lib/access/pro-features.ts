import type { User } from '@/types/user';

/**
 * Routes whose access requires the user's agency to be on the `standard`
 * plan. Used by the sidebar to render these entries with a padlock for
 * agency_admins still on `individual`.
 *
 * **Chaque route listée ici DOIT être gardée côté serveur.** Le cadenas est un
 * confort d'interface, jamais une autorisation : il n'empêche que le clic, et
 * une URL tapée à la main passe à travers. `scripts/check-pro-routes.mjs` le
 * vérifie à chaque CI et refuse toute entrée neuve non gardée.
 *
 * Cette liste en comptait quatre de plus — `/app/overview/{kpis,alerts,agency}`
 * et `/app/owners` — et le docblock affirmait alors que « the pages themselves
 * redirect to `/app` server-side, which is the ultimate gate ». Mesuré le
 * 2026-08-12 : c'était faux pour ces quatre-là. Ni leur page, ni leur API
 * (`KpiConfigController`, `ThresholdAlertController`, `owners`,
 * `DashboardController`) ne portait la moindre garde — la restriction n'avait
 * **jamais** été implémentée nulle part. Le cadenas promettait donc une
 * limitation qui n'existait pas, aux seuls `agency_admin`, sur des écrans
 * ouverts à tous.
 *
 * Arbitré (TCK-284) : ces écrans ne sont **pas** réservés aux agences
 * `standard`. Les quatre entrées sont retirées, le comportement réel ne change
 * pas, et la barre latérale cesse de mentir.
 */
export const PRO_ROUTES: ReadonlySet<string> = new Set([
  // /admin/... — console admin agence. Chacune de ces cinq routes est gardée en SSR par
  // `ensureStandardAgencyOrRedirect`, et son API par `AgencyKindGuard` côté Laravel.
  // `scripts/check-pro-routes.mjs` le vérifie à chaque CI.
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
