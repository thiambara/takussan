import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import {
  FALLBACK_LOCALE,
  LOCALE_COOKIE_NAME,
  TIMEZONE,
  isLocale,
  type Locale,
} from './config';
import { localeDeRepli } from './routing';

/**
 * Résout la langue active de la requête courante.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA PRÉSÉANCE, ET POURQUOI L'URL EST ABSOLUE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. le segment `[locale]` de l'URL — {@link ADR-0026}. **Seul, et sans recours.**
 *   2. à défaut (surfaces non localisées : console, `/auth`, `/onboarding`, `/publish`) :
 *      cookie `NEXT_LOCALE` → `Accept-Language` → `fr`.
 *
 * ⚠️ Le point 1 ne consulte NI le cookie NI l'en-tête, et c'est tout l'objet de TCK-434 : tant que
 * la langue se lisait dans le cookie, la même URL rendait trois contenus selon le demandeur — un
 * lien partagé perdait sa langue en route, et un robot, qui n'envoie pas de cookie, n'obtenait
 * jamais que du français. Rétablir un repli sur le cookie ici recréerait exactement ce défaut, en
 * le rendant plus difficile à voir puisque l'URL aurait l'air correcte.
 *
 * `requestLocale` est la valeur du segment `[locale]` résolue par next-intl ; elle vaut `undefined`
 * hors de `src/app/[locale]/**`, ce qui est le signal — et non une anomalie — que la surface n'est
 * pas localisée par URL.
 */
async function resolveLocale(requestLocale: string | undefined): Promise<Locale> {
  if (isLocale(requestLocale)) return requestLocale;

  const cookieStore = await cookies();
  const headerList = await headers();
  return localeDeRepli(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    headerList.get('accept-language'),
  );
}

type MessageTree = Record<string, unknown>;

/**
 * Recursively merge `override` onto `base`. Strings/arrays in `override`
 * win; nested objects are deep-merged.
 *
 * ⚠ Ce mécanisme a été posé pour « layer partial wolof translations on top of the full French
 * dictionary ». Mesuré le 2026-08-27, le wolof N'EST PLUS partiel : 5 338 clés sur 5 338, dont
 * 95,4 % des valeurs distinctes du français — davantage que l'anglais (92,5 %). Le repli ne comble
 * donc plus qu'un résidu de libellés légitimement identiques. C'est cette mesure qui a permis à
 * ADR-0026 §4 de donner à `wo` une URL indexable sans régime d'exception.
 */
function mergeMessages(base: MessageTree, override: MessageTree): MessageTree {
  const result: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = mergeMessages(existing as MessageTree, value as MessageTree);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function loadMessages(locale: Locale): Promise<MessageTree> {
  // Always load the fallback so missing keys gracefully resolve to French.
  const fallback = (await import(`../messages/${FALLBACK_LOCALE}.json`)).default as MessageTree;
  if (locale === FALLBACK_LOCALE) return fallback;
  const localeMessages = (await import(`../messages/${locale}.json`)).default as MessageTree;
  return mergeMessages(fallback, localeMessages);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await resolveLocale(await requestLocale);
  const messages = await loadMessages(locale);
  return {
    locale,
    messages,
    timeZone: TIMEZONE,
    now: new Date(),
  };
});
