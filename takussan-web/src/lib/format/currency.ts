/**
 * TCK-084 — multi-currency-aware `formatCurrency` helper.
 *
 * Builds on the TCK-078 single-callsite helper: callers still pass `(amount,
 * currency)` and get back a localised string. The difference is that the
 * locale, decimal-places, and symbol position now derive from the currency
 * itself instead of being baked in around `XOF`.
 *
 * Output (AC4-AC6):
 *   - XOF →  "150 000 F CFA"
 *   - EUR →  "150 000,00 €"
 *   - USD →  "$150,000.00"
 *
 * The implementation deliberately avoids `style: 'currency'` because ICU
 * sometimes ships locale-specific abbreviations (e.g. "CFA" instead of
 * "F CFA") that drift from the spec contract. Instead we format the number
 * in `decimal` style and append the symbol from {@link CURRENCY_METADATA}.
 *
 * The `Money` component and the Blade `@currency` directive both share this
 * exact contract — keep them in sync if you tweak any rule below.
 */

const DEFAULT_CURRENCY: CurrencyCode = 'XOF';

/**
 * Supported currency codes. Mirrors the backend `App\Models\Enums\Currency`.
 */
export type CurrencyCode = 'XOF' | 'XAF' | 'EUR' | 'USD';

interface CurrencyMetadata {
  /** Symbol or abbreviation rendered next to the amount. */
  readonly symbol: string;
  /** Decimal places used at display time. */
  readonly decimalPlaces: number;
  /** BCP-47 locale used for grouping/decimal separators. */
  readonly locale: string;
  /** Symbol placement relative to the formatted number. */
  readonly position: 'before' | 'after';
}

export const CURRENCY_METADATA: Readonly<Record<CurrencyCode, CurrencyMetadata>> = {
  XOF: { symbol: 'F CFA', decimalPlaces: 0, locale: 'fr-SN', position: 'after' },
  XAF: { symbol: 'F CFA', decimalPlaces: 0, locale: 'fr-CM', position: 'after' },
  EUR: { symbol: '€', decimalPlaces: 2, locale: 'fr-FR', position: 'after' },
  USD: { symbol: '$', decimalPlaces: 2, locale: 'en-US', position: 'before' },
};

export interface FormatCurrencyOptions {
  /** BCP-47 locale override (rare; typically derived from the currency). */
  readonly locale?: string;
  /** Override the minimum fraction digits — defaults to the currency's value. */
  readonly minimumFractionDigits?: number;
  /** Override the maximum fraction digits — defaults to the currency's value. */
  readonly maximumFractionDigits?: number;
}

function getMetadata(currency: CurrencyCode | string): CurrencyMetadata {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  return (CURRENCY_METADATA as Record<string, CurrencyMetadata>)[code]
    ?? CURRENCY_METADATA[DEFAULT_CURRENCY];
}

/**
 * Format a monetary value for display. Returns an empty string for `null`,
 * `undefined`, or `NaN` so callers can drop the result straight into JSX.
 *
 * @example
 *   formatCurrency(150_000)          // "150 000 F CFA"
 *   formatCurrency(150_000.5, 'EUR') // "150 000,50 €"
 *   formatCurrency(150_000, 'USD')   // "$150,000.00"
 *   formatCurrency(null, 'EUR')      // ""
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: CurrencyCode | string = DEFAULT_CURRENCY,
  options: FormatCurrencyOptions = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '';
  }

  const meta = getMetadata(currency);
  const {
    locale = meta.locale,
    minimumFractionDigits = meta.decimalPlaces,
    maximumFractionDigits = meta.decimalPlaces,
  } = options;

  const number = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);

  return meta.position === 'before'
    ? `${meta.symbol}${number}`
    : `${number} ${meta.symbol}`;
}

/**
 * Resolve the display symbol for a given currency code — useful for UI
 * tooltips and labels that don't need the full formatted amount.
 */
export function currencySymbol(currency: CurrencyCode | string): string {
  return getMetadata(currency).symbol;
}

/**
 * Locale used to format a given currency, exposed so callers (e.g. a `<Money>`
 * preview) can build their own `Intl.NumberFormat` if needed.
 */
export function currencyLocale(currency: CurrencyCode | string): string {
  return getMetadata(currency).locale;
}
