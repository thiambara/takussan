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
 * Resolve the active locale for the current request.
 *
 * Precedence:
 * 1. `NEXT_LOCALE` cookie set by the user via the LanguageSwitcher
 * 2. `Accept-Language` header (first supported locale)
 * 3. {@link DEFAULT_LOCALE}
 */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  const headerList = await headers();
  const acceptLanguage = headerList.get('accept-language');
  if (acceptLanguage) {
    const candidates = acceptLanguage
      .split(',')
      .map((part) => part.split(';')[0]?.trim().split('-')[0]?.toLowerCase())
      .filter(Boolean);
    for (const candidate of candidates) {
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
