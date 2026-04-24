/**
 * TCK-078 — single `formatCurrency` helper callsite.
 *
 * The existing {@link file://../format.ts `@/lib/format`} module exposes a
 * locale-aware formatter that takes `(value, locale, options)` — appropriate
 * for localised UI contexts. This module provides a simpler, locale-agnostic
 * helper aligned with the ticket contract: `(amount, currency)` with a fixed
 * `XOF` default, so every ad-hoc `new Intl.NumberFormat('fr-SN', { currency:
 * 'XOF' })` across the codebase can collapse into a single call site.
 *
 * TCK-084 (V8-D) will later swap the implementation to support multi-currency
 * conversion and locale-switching; until then this helper has XOF baked in so
 * that migrating callsites does not accidentally broaden scope.
 */

const DEFAULT_CURRENCY = 'XOF';
const DEFAULT_LOCALE = 'fr-SN';

/**
 * Supported currency codes. Matches the union used in the generated
 * {@link file://../../types/lease.ts `@/types/lease`} module. Keep narrow —
 * TCK-084 is the ticket that widens this.
 */
export type CurrencyCode = 'XOF' | 'XAF' | 'EUR' | 'USD';

export interface FormatCurrencyOptions {
  /** BCP-47 locale. Defaults to `fr-SN`. */
  readonly locale?: string;
  /** Minimum fraction digits. Defaults to 0 (XOF has no sub-unit). */
  readonly minimumFractionDigits?: number;
  /** Maximum fraction digits. Defaults to 0. */
  readonly maximumFractionDigits?: number;
}

/**
 * Format a monetary value with the active currency. Guards against
 * `null` / `undefined` / `NaN` by returning an empty string so callers
 * can drop the result directly into JSX without extra checks.
 *
 * @example
 *   formatCurrency(123456)              // "123 456 F CFA"
 *   formatCurrency(42, 'EUR')           // "42 €"
 *   formatCurrency(null)                // ""
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: CurrencyCode | string = DEFAULT_CURRENCY,
  options: FormatCurrencyOptions = {},
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '';
  }

  const {
    locale = DEFAULT_LOCALE,
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
  } = options;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || DEFAULT_CURRENCY,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}
