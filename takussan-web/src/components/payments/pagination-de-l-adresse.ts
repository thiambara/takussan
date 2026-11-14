/**
 * TCK-2805 — LA lecture de la page et de la densité dans l'adresse, pour `/app/payments` et les listes
 * de TCK-2815 ci-dessous.
 *
 * `PropertyPagination` ÉCRIT `?page=` et `?per_page=` (son sélecteur propose 10, 20 ou 50 lignes) ;
 * « Factures », « Reversements », l'historique des paiements et « Interventions » (agence) les
 * LISENT ici. Jusqu'à TCK-2805, les trois premiers envoyaient `per_page: 20`
 * en dur : le sélecteur revenait à 20 et le choix n'avait aucun effet.
 *
 * TCK-2815 — le carnet des bailleurs (`lib/owners/carnet.ts`), la bibliothèque de documents du
 * personnel et la liste des clients (« au-delà » seulement : sa densité passe par `parPageDeLUrl`)
 * lisent ici aussi, avec `PageAuDelaDeLaDerniere`.
 *
 * ⚠ Ce module vit HORS de `PropertyPagination.tsx` : treize tests (2026-11-14) remplacent ce module-là
 * par `() => null`, et la lecture partirait avec lui.
 *
 * L'API borne aussi (`HasQueryBuilder::getPerPage` et `PaymentController::history` : 1 à 100) ; la
 * liste fermée d'ici n'en est pas la garde, elle tient l'écran et le sélecteur d'accord.
 */

/** Les densités que propose le sélecteur de `PropertyPagination`. */
export const DENSITES_ADMISES = [10, 20, 50] as const;

/** Toute densité absente ou hors de la liste retombe ici — le défaut du sélecteur. */
export const DENSITE_PAR_DEFAUT = 20;

type LectureDAdresse = Pick<URLSearchParams, 'get'> | null | undefined;

/** Un entier strictement positif lu dans l'adresse, sinon `defaut` (`abc`, `-3`, `0`, absent). */
function entierPositif(adresse: LectureDAdresse, nom: string, defaut: number): number {
  const brut = adresse?.get(nom) ?? '';
  if (!/^\d+$/.test(brut)) return defaut;
  const n = Number.parseInt(brut, 10);
  return n > 0 ? n : defaut;
}

/** `?per_page=` borné à 10, 20 ou 50 ; toute autre valeur (`37`, `abc`, `5000`) rend 20. */
export function densiteDeLAdresse(adresse: LectureDAdresse): number {
  const n = entierPositif(adresse, 'per_page', DENSITE_PAR_DEFAUT);
  return (DENSITES_ADMISES as readonly number[]).includes(n) ? n : DENSITE_PAR_DEFAUT;
}

/** La page demandée (`?page=` par défaut), 1 ou plus. */
export function pageDeLAdresse(adresse: LectureDAdresse, nom = 'page'): number {
  return entierPositif(adresse, nom, 1);
}

/** La forme de `meta` qu'il faut pour juger « vide » contre « au-delà de la dernière page ». */
export interface MetaDePagination {
  readonly total: number;
  readonly last_page: number;
}

/**
 * La page rendue n'a aucune ligne alors que la liste en compte : la page demandée est au-delà de
 * la dernière (un lien gardé après que la liste a diminué). Jugé sur `meta.total`, jamais sur le
 * seul nombre de lignes : sans `meta`, la liste est dite vide, comme avant.
 */
export function estAuDelaDeLaDernierePage(lignes: number, meta: MetaDePagination | null | undefined): boolean {
  return lignes === 0 && (meta?.total ?? 0) > 0;
}
