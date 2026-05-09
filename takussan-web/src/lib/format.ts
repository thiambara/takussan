import { TIMEZONE, type Locale } from '@/i18n/config';
import { formatCurrency as formatCurrencyCustom } from './format/currency';

/**
 * Locale-aware formatters wrapping {@link Intl.DateTimeFormat} and
 * {@link Intl.NumberFormat}. Always default to `Africa/Dakar` for dates and
 * to XOF (CFA franc) for currency — the Senegal defaults — while letting
 * callers override when needed.
 *
 * Kept dependency-light: the currency helper lives in ./format/currency.
 * Both Server and Client Components import this module safely.
 */

/**
 * Map our app locale codes onto BCP-47 tags that the `Intl` APIs recognise.
 * Wolof (`wo`) isn't shipped in CLDR for most runtimes; Intl silently falls
 * back to the root locale (English-style formatting) when passed a single
 * unsupported tag. Passing an array lets us force an explicit fallback to
 * `fr-SN` so Wolof users still see Senegalese number/date conventions.
 */
function toIntlLocale(locale: Locale): string | readonly string[] {
  switch (locale) {
    case 'fr':
      return 'fr-SN';
    case 'en':
      return 'en-GB';
    case 'wo':
      return ['wo', 'fr-SN'] as const;
    default:
      return 'fr-SN';
  }
}

/**
 * Resolve an app locale to the BCP-47 string used by {@link formatCurrencyCustom}.
 */
function toCurrencyLocale(locale: Locale): string {
  switch (locale) {
    case 'fr':
      return 'fr-SN';
    case 'en':
      return 'en-GB';
    case 'wo':
      return 'fr-SN';
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
  return new Intl.DateTimeFormat(toIntlLocale(locale) as string | string[], {
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
  return new Intl.NumberFormat(toIntlLocale(locale) as string | string[], options).format(value);
}

/**
 * Format a monetary amount in F CFA (XOF) by default, using the Senegalese
 * French number conventions. Delegates to the multi-currency helper so the
 * output matches the UX spec contract (e.g. "150 000 F CFA").
 *
 * For non-XOF currencies, import {@link formatCurrencyCustom} directly.
 */
export function formatCurrency(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  const currency = typeof options.currency === 'string' ? options.currency : 'XOF';
  return formatCurrencyCustom(value, currency, {
    locale: toCurrencyLocale(locale),
    minimumFractionDigits: options.minimumFractionDigits as number | undefined,
    maximumFractionDigits: options.maximumFractionDigits as number | undefined,
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
