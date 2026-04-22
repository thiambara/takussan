import { TIMEZONE, type Locale } from '@/i18n/config';

/**
 * Locale-aware formatters wrapping {@link Intl.DateTimeFormat} and
 * {@link Intl.NumberFormat}. Always default to `Africa/Dakar` for dates and
 * to XOF (CFA franc) for currency — the Senegal defaults — while letting
 * callers override when needed.
 *
 * Keep this file dependency-free: it's imported both in Server and Client
 * Components and is used by the components migrated as part of TCK-017.
 */

/**
 * Map our app locale codes onto BCP-47 tags that the `Intl` APIs recognise.
 * Wolof (`wo`) isn't supported by every browser runtime; we fall back to
 * French formatting so numbers and dates still render sanely.
 */
function toIntlLocale(locale: Locale): string {
  switch (locale) {
    case 'fr':
      return 'fr-SN';
    case 'en':
      return 'en-GB';
    case 'wo':
      // `wo` BCP-47 tag — Node/Chrome fall back to a compatible CLDR locale
      // where Wolof data isn't shipped, which is acceptable for now.
      return 'wo';
    default:
      return 'fr-SN';
  }
}

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  /** BCP-47 timezone. Defaults to {@link TIMEZONE}. */
  readonly timeZone?: string;
}

/**
 * Format a date value using the given locale. Accepts Date, ISO string or
 * epoch millis. Returns an empty string for `null`/`undefined` so callers
 * can drop it straight into JSX.
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  locale: Locale,
  options: FormatDateOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const { timeZone = TIMEZONE, ...rest } = options;
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    timeZone,
    ...rest,
  }).format(date);
}

/**
 * Format a date and time (defaults to medium date + short time).
 */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: Locale,
  options: FormatDateOptions = {},
): string {
  return formatDate(value, locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
}

/**
 * Format a number using the given locale. Leaves `null`/`undefined`
 * untouched so callers can guard in the JSX.
 */
export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

/**
 * Format a monetary amount. Defaults to XOF (CFA franc) with no fraction
 * digits — the ISO 4217 entry for XOF specifies 0 decimals anyway.
 */
export function formatCurrency(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, locale, {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
    ...options,
  });
}

/**
 * Format a percentage using the given locale. Expects a fraction (`0.12`
 * → `12 %` in French locale).
 */
export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, locale, {
    style: 'percent',
    maximumFractionDigits: 2,
    ...options,
  });
}
