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
 *     redirect('/app')` — les routes `/app/*`, qui résolvent déjà l'agence
 *     pour leur propre affichage et n'avaient pas besoin du helper.
 *
 * Une première version de cette garde ne cherchait que la CHAÎNE
 * `ensureStandardAgencyOrRedirect`. Elle a donc conclu que les routes
 * `/app/*` n'étaient protégées nulle part, et elles ont été retirées de cette
 * liste — retirant un cadenas devant des pages qui redirigent réellement.
 * Elles sont rétablies. *Une garde qui cherche un JETON ne mesure pas la
 * PROPRIÉTÉ : elle rend un faux négatif avec l'autorité d'une mesure.*
 *
 * TCK-284 — la garde SSR n'est pas non plus une autorisation : elle protège
 * l'écran, pas la donnée. Chaque route listée ici doit AUSSI être refusée par
 * l'API qu'elle appelle. C'est le cas de `/app/overview/agency`
 * (`DashboardAgencyController`) et, depuis ce ticket, de `/app/owners`
 * (`OwnerProfileController::index` + `AgencyKindGuard`).
 */
export const PRO_ROUTES: ReadonlySet<string> = new Set([
  // /app/... — espace perso agency_admin. Gardées EN LIGNE dans leur page :
  //   app/overview/agency/page.tsx · app/owners/page.tsx
  //
  // Sans numéros de ligne, DÉLIBÉRÉMENT. Ceux qui figuraient ici étaient déjà faux dans le
  // commit qui les introduisait : les commentaires explicatifs ajoutés par ce même commit
  // avaient décalé chaque garde de quelques lignes. Un lecteur qui les suivait atterrissait
  // dans un bloc d'imports. `scripts/check-pro-routes.mjs` vérifie le lien, lui, à chaque CI.
  //
  // TCK-284 — `/app/overview/kpis` et `/app/overview/alerts` NE SONT PLUS ICI. Elles y
  // avaient été mises par le commit « gate standard-only features » (5d40dd31) sans qu'aucun
  // ticket ni aucune spec ne les désigne comme pro : `docs/features.md` §1.12 énumère une
  // liste FERMÉE de restrictions pour les agences `individual`, les KPI et les alertes de
  // seuil n'y figurent pas, et la clause résiduelle (« toutes les autres capacités restent
  // disponibles ») les rend explicitement disponibles. Le cadenas était l'ajout, pas la
  // garde manquante. *Un verrou qu'aucune règle ne réclame finit par se faire lire comme
  // la règle.*
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
 *
 * TCK-284 — le cadenas couvre les `agent` en plus des `agency_admin`, et ce
 * n'est pas un élargissement de restriction : c'est l'alignement du cadenas
 * sur une porte qui existait déjà. `buildNavItems` pousse « Vue agence » aux
 * agents ; la page les redirige (`overview/agency/page.tsx`) et l'API leur
 * rend 403 (`DashboardAgencyController`). Un agent d'agence `individual`
 * voyait donc une entrée d'apparence normale qui le renvoyait en silence sur
 * `/app`. *Une porte fermée sans panneau se lit comme une panne.*
 *
 * Aucun autre couple (rôle, route) ne change : `/app/owners` n'est jamais
 * poussé aux agents, et les cinq routes `/admin/*` sont hors d'atteinte pour
 * eux (`(dashboard)/admin/layout.tsx` redirige tout non-`isAdmin`).
 */
export function isProRouteLocked(
  user: User,
  agencyIsStandard: boolean | undefined,
  href: string,
): boolean {
  if (!PRO_ROUTES.has(href)) return false;
  if (user.roles.includes('super_admin')) return false;
  if (!user.roles.includes('agency_admin') && !user.roles.includes('agent')) return false;
  return agencyIsStandard !== true;
}
