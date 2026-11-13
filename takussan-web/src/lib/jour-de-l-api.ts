/**
 * Le jour de l'API (P212) : celui que lisent ses règles `today`, `after:today`,
 * `before_or_equal:today`, `+60 days`… Le fuseau de l'API est `UTC` (`config/app.php`).
 *
 * Tout `min`, `max` ou défaut d'un champ de date qu'une règle `today` de l'API juge part de ce
 * jour, et jamais des composantes locales du navigateur (`getDate()`, `setDate()`…) : celles-ci
 * décalent d'un jour entre minuit local et minuit UTC hors de Dakar, et aux changements d'heure
 * quand on relit le résultat par `toISOString()`.
 *
 * Les jours sont des chaînes `AAAA-MM-JJ`, comparables littéralement (ADR-0018).
 */

/** Le jour UTC de l'instant donné, `AAAA-MM-JJ`. */
export function jourDeLApi(maintenant: Date = new Date()): string {
  return maintenant.toISOString().slice(0, 10);
}

/** `jour` (`AAAA-MM-JJ`) décalé de `jours` jours calendaires, sans heure ni fuseau. */
export function decalerJour(jour: string, jours: number): string {
  const [a, m, j] = jour.split('-').map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

/** `jour` (`AAAA-MM-JJ`) décalé de `annees` années calendaires (29 février → 1er mars). */
export function decalerAnnees(jour: string, annees: number): string {
  const [a, m, j] = jour.split('-').map((x) => Number.parseInt(x, 10));
  return new Date(Date.UTC(a + annees, m - 1, j)).toISOString().slice(0, 10);
}

/**
 * `jour` (`AAAA-MM-JJ`) en `Date` à minuit LOCAL : la forme qu'attend un calendrier
 * (`react-day-picker`), qui désigne un jour par ses composantes locales.
 */
export function jourEnDateLocale(jour: string): Date {
  const [a, m, j] = jour.split('-').map((x) => Number.parseInt(x, 10));
  return new Date(a, m - 1, j);
}

/**
 * TCK-2768 — les bornes d'années d'un jour que l'API admet. ⚠ Miroir de `App\Rules\JourIso::ANNEE_MIN`
 * et `::ANNEE_MAX` (PHP) : le plafond y est PROVISOIRE (2199, en attente du porteur) et se change dans
 * les deux à la fois.
 */
export const ANNEE_MIN_DE_L_API = 1970;
export const ANNEE_MAX_DE_L_API = 2199;

/**
 * TCK-2768 — `valeur` est-elle un jour que l'API admet (`JourIso`) : `AAAA-MM-JJ` exactement, jour qui
 * existe, année de {@link ANNEE_MIN_DE_L_API} à {@link ANNEE_MAX_DE_L_API} ? La forme seule ne suffit
 * pas : « 2026-02-30 » a la bonne forme, et l'API le refuse (422).
 */
export function estUnJourDeLApi(valeur: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (a < ANNEE_MIN_DE_L_API || a > ANNEE_MAX_DE_L_API) return false;
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}
