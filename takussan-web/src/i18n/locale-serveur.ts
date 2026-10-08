import { getLocale } from 'next-intl/server';

import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

/**
 * TCK-595 (AC20 ter) — la langue de la requête, côté serveur, typée `Locale`.
 *
 * C'est celle que `getTranslations` sert déjà à la même page : un composant serveur qui formate un
 * montant avec un `'fr'` écrit en dur rend `150 000 F CFA` sous des libellés anglais. `getLocale()`
 * rend une chaîne ; la valeur descend d'un cookie et d'une URL, d'où la garde `isLocale`.
 */
export async function localeDeLaRequete(): Promise<Locale> {
  const brut = await getLocale();
  return isLocale(brut) ? brut : DEFAULT_LOCALE;
}
