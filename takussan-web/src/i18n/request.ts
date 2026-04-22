import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_COOKIE_NAME,
  TIMEZONE,
  isLocale,
  type Locale,
} from './config';

/**
 * Parse an `Accept-Language` header into primary language tags
 * sorted by client preference (q-factor descending).
 *
 * Handles inputs like `fr;q=0.1, en;q=0.9` where the first-listed
 * tag is NOT the preferred one. Tags with malformed q-factors keep
 * the RFC 7231 default of 1.0. Returns lowercased primary subtags
 * (e.g. `fr` from `fr-CA`).
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((item) => {
      const [rawTag, ...params] = item.split(';');
      const tag = rawTag?.trim().split('-')[0]?.toLowerCase();
      if (!tag) return null;
      let q = 1.0;
      for (const param of params) {
        const match = param.trim().match(/^q=([0-9.]+)$/i);
        if (match) {
          const parsed = Number.parseFloat(match[1]!);
          if (Number.isFinite(parsed)) q = parsed;
          break;
        }
      }
      return { tag, q };
    })
    .filter((entry): entry is { tag: string; q: number } => entry !== null)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/**
 * Resolve the active locale for the current request.
 *
 * Precedence:
 * 1. `NEXT_LOCALE` cookie set by the user via the LanguageSwitcher
 * 2. `Accept-Language` header (first supported locale by q-factor)
 * 3. {@link DEFAULT_LOCALE}
 */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  const headerList = await headers();
  const acceptLanguage = headerList.get('accept-language');
  if (acceptLanguage) {
    for (const candidate of parseAcceptLanguage(acceptLanguage)) {
      if (isLocale(candidate)) return candidate;
    }
  }

  return DEFAULT_LOCALE;
}

type MessageTree = Record<string, unknown>;

/**
 * Recursively merge `override` onto `base`. Strings/arrays in `override`
 * win; nested objects are deep-merged. Used to layer partial wolof
 * translations on top of the full French dictionary (fallback → fr).
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

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);
  return {
    locale,
    messages,
    timeZone: TIMEZONE,
    now: new Date(),
  };
});
