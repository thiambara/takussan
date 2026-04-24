<?php

namespace App\Services\Formatting;

use App\Models\Enums\Currency;
use NumberFormatter;

/**
 * TCK-084 — central currency formatter for the backend.
 *
 * Mirrors the contract of the frontend `formatCurrency` helper so that any
 * server-rendered surface (PDF templates, e-mails, logs) produces output that
 * is byte-identical to what the user sees in the SPA.
 *
 * Output (AC4-AC6):
 *   - XOF →  "150 000 F CFA"  (NBSP grouping, symbol AFTER)
 *   - EUR →  "150 000,00 €"   (NBSP grouping, comma decimal, symbol AFTER)
 *   - USD →  "$150,000.00"    (comma grouping, dot decimal, symbol BEFORE)
 *
 * The class deliberately avoids the `style: NumberFormatter::CURRENCY` mode
 * because ICU adds a non-breaking space + currency-specific quirks (e.g. "CFA"
 * instead of "F CFA") that drift from the spec contract. Instead we format
 * the number in DECIMAL mode and concatenate the {@see Currency::symbol()}.
 *
 * Requires the `intl` PHP extension (already mandated by laravel/framework).
 */
class CurrencyFormatter
{
    /**
     * Format a numeric amount using the rules attached to `$currency`.
     */
    public function format(int|float $amount, Currency $currency, ?string $locale = null): string
    {
        $effectiveLocale = $locale ?? $currency->locale();
        $decimals = $currency->decimalPlaces();

        $formatter = new NumberFormatter($effectiveLocale, NumberFormatter::DECIMAL);
        $formatter->setAttribute(NumberFormatter::MIN_FRACTION_DIGITS, $decimals);
        $formatter->setAttribute(NumberFormatter::MAX_FRACTION_DIGITS, $decimals);

        $number = $formatter->format((float) $amount);
        if ($number === false) {
            $number = number_format((float) $amount, $decimals, ',', "\u{202F}");
        }

        return $currency->position() === 'before'
            ? $currency->symbol().$number
            : $number."\u{00A0}".$currency->symbol();
    }

    /**
     * Parse a localised currency string back to a float. Strips the symbol
     * and any group/decimal separators introduced by `format()`. Returns 0.0
     * for unparseable input (callers should validate upstream).
     */
    public function parse(string $value, Currency $currency, ?string $locale = null): float
    {
        $effectiveLocale = $locale ?? $currency->locale();

        // Strip the symbol first so the parser only sees the number.
        $sanitized = str_replace($currency->symbol(), '', $value);
        // Replace narrow / non-breaking spaces by a regular space so ICU
        // recognises the thousands grouping.
        $sanitized = str_replace(["\u{00A0}", "\u{202F}"], ' ', $sanitized);
        $sanitized = trim($sanitized);

        $formatter = new NumberFormatter($effectiveLocale, NumberFormatter::DECIMAL);
        $position = 0;
        $parsed = $formatter->parse($sanitized, NumberFormatter::TYPE_DOUBLE, $position);

        if ($parsed === false) {
            // Last-resort fallback for strings the locale parser refuses
            // (e.g. user pasted USD output into an EUR formatter).
            $fallback = preg_replace('/[^0-9.\-]/', '', str_replace(',', '.', $sanitized));

            return is_numeric($fallback) ? (float) $fallback : 0.0;
        }

        return (float) $parsed;
    }
}
