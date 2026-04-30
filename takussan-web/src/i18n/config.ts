/**
 * i18n configuration for Takussan.
 *
 * Locales:
 * - `fr` — French (default, national language)
 * - `en` — English (diaspora + international investors)
 * - `wo` — Wolof (national language; partial coverage, fallback → fr)
 *
 * Timezone and number formatting follow Senegal conventions (Africa/Dakar,
 * space as thousands separator, dd/MM/yyyy dates).
 */

export const LOCALES = ['fr', 'en', 'wo'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';

/**
 * Fallback chain: any missing key in `wo` → `fr`. We always ship both `fr`
 * and the requested locale so the IntlProvider can resolve `wo` → `fr`.
 */
export const FALLBACK_LOCALE: Locale = 'fr';

export const TIMEZONE = 'Africa/Dakar';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

/**
 * Cookie lifetime (1 year, in seconds).
 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  wo: 'Wolof',
};

/**
 * Short labels for compact UI (language switcher badge).
 */
export const LOCALE_SHORT: Record<Locale, string> = {
  fr: 'FR',
  en: 'EN',
  wo: 'WO',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
