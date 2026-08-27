/**
 * TCK-377 — Résolution de l'entrée ACTIVE d'une barre latérale, écrite UNE fois pour les trois
 * shells (`AppSidebar`, `AdminSidebar`, `SuperAdminSidebar`).
 *
 * Le dépôt portait trois réponses à la même question, écrites dans trois générations :
 * `AdminSidebar` en ligne (préfixe + deux racines exactes), `SuperAdminSidebar` dans une fonction
 * locale (même forme), et `AppSidebar` par `pathname === item.href` — qui n'allumait RIEN sur les
 * douze routes de détail de `/app` (`/app/properties/42`, `/app/leases/7`, …). *Une règle recopiée
 * trois fois est une règle qui n'a été corrigée qu'une fois sur trois.*
 *
 * Deux formes, parce que les shells ne veulent pas la même chose :
 *
 *  - {@link isActiveHref} — préfixe simple. Un parent reste allumé quand une de ses sous-entrées
 *    l'est. C'est ce que veut `SuperAdminSidebar`, dont les `children` s'affichent SOUS leur
 *    parent : éteindre le parent couperait le fil visuel.
 *  - {@link resolveActiveHref} — **le plus long préfixe gagne, et lui seul**. C'est ce que veulent
 *    les barres à plat : sur `/app/properties/new`, « Mes biens » et « Publier un bien » sont tous
 *    deux des préfixes valides, et deux entrées allumées ne désignent plus rien.
 *
 * ⚠ `exactRoots` n'est pas une commodité, c'est la seule chose qui empêche une racine d'être le
 * parent de tout : sans `/app` dans la liste, « Tableau de bord » s'allume sur les 46 routes de
 * `/app`. Le plus-long-préfixe ne suffit pas — sur `/app/profile`, aucune entrée n'est plus
 * spécifique que `/app`, et c'est `/app` qui gagnerait.
 */

/** Racines de `/app` comparées par ÉGALITÉ STRICTE. */
export const APP_EXACT_ROOTS: readonly string[] = ['/app', '/admin'];

/**
 * Racines de `/admin` comparées par ÉGALITÉ STRICTE.
 *
 * `/admin/agency` y figure depuis l'origine d'`AdminSidebar` : la console porte
 * `/admin/agency/kyc` et `/admin/agency/billing`, et « Agence » ne doit pas s'allumer avec elles.
 */
export const ADMIN_EXACT_ROOTS: readonly string[] = ['/admin', '/admin/agency'];

/** Racine de `/super-admin` comparée par ÉGALITÉ STRICTE. */
export const SUPER_ADMIN_EXACT_ROOTS: readonly string[] = ['/super-admin'];

function matches(pathname: string, href: string, exactRoots: readonly string[]): boolean {
  if (exactRoots.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `true` quand `href` couvre `pathname` — égalité pour les racines listées, préfixe sinon.
 *
 * Forme historique d'`AdminSidebar` / `SuperAdminSidebar`, conservée telle quelle : plusieurs
 * entrées peuvent répondre `true` en même temps.
 */
export function isActiveHref(
  pathname: string | null,
  href: string,
  exactRoots: readonly string[] = [],
): boolean {
  if (!pathname) return false;
  return matches(pathname, href, exactRoots);
}

/**
 * Rend le SEUL `href` actif : parmi tous ceux qui couvrent `pathname`, le plus long.
 *
 * La longueur est le bon départage parce que les `href` sont des chemins : un chemin plus long
 * qui couvre encore `pathname` est nécessairement plus spécifique. Rend `null` quand aucun ne
 * couvre — ce qui arrive sur les routes hors menu (`/app/profile`, `/app/account/privacy`), et
 * c'est le comportement voulu : mieux vaut aucune entrée allumée qu'une entrée fausse.
 */
export function resolveActiveHref(
  pathname: string | null,
  hrefs: readonly string[],
  exactRoots: readonly string[] = [],
): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    if (!matches(pathname, href, exactRoots)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
