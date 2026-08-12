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
 * La garde connaît **deux** formes de protection, et il a fallu une revue pour
 * qu'elle connaisse la seconde :
 *
 *  1. l'appel au helper `ensureStandardAgencyOrRedirect(user)` — les cinq
 *     routes `/admin/*` ;
 *  2. la garde **écrite en ligne** — `if (agency.kind !== 'standard')
 *     redirect('/app')` — les quatre routes `/app/*`, qui résolvent déjà
 *     l'agence pour leur propre affichage et n'avaient pas besoin du helper.
 *
 * Une première version de cette garde ne cherchait que la CHAÎNE
 * `ensureStandardAgencyOrRedirect`. Elle a donc conclu que les quatre routes
 * `/app/*` n'étaient protégées nulle part, et elles ont été retirées de cette
 * liste — retirant un cadenas devant des pages qui redirigent réellement.
 * Elles sont rétablies. *Une garde qui cherche un JETON ne mesure pas la
 * PROPRIÉTÉ : elle rend un faux négatif avec l'autorité d'une mesure.*
 */
export const PRO_ROUTES: ReadonlySet<string> = new Set([
  // /app/... — espace perso agency_admin. Gardées EN LIGNE dans leur page :
  //   app/overview/kpis/page.tsx:21 · alerts/page.tsx:21 · agency/page.tsx:35 · owners/page.tsx:47
  '/app/overview/kpis',
  '/app/overview/alerts',
  '/app/overview/agency',
  '/app/owners',
  // /admin/... — console admin agence. Gardées par `ensureStandardAgencyOrRedirect` en SSR,
  // et leur API par `AgencyKindGuard` côté Laravel.
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
