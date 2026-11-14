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
 * TCK-2794 (décision n° 11 (a) du porteur, suite de TCK-2714) — les groupes de milliers de tout
 * texte que l'API rend pour une personne (PDF, notification, SMS, courriel) passent par
 * {@see self::nombre()}, et sortent en espace insécable de pleine largeur U+00A0 comme à l'écran
 * (`takussan-web/src/lib/format/groupes.ts`) : ICU écrit en `fr` l'espace FINE U+202F, que DM Sans
 * dessine à 0,133 em. Seul le TEXTE change : un montant reste un nombre en base, dans tout JSON, dans
 * les CSV d'export et à la frontière d'un driver de paiement (principe n° 3), qui ne passent pas ici.
 *
 * Requires the `intl` PHP extension (already mandated by laravel/framework).
 */
class CurrencyFormatter
{
    /** L'espace qui sépare les groupes de milliers dans un texte rendu (TCK-2794). */
    public const ESPACE_DE_GROUPE = "\u{00A0}";

    /**
     * Format a numeric amount using the rules attached to `$currency`.
     */
    public function format(int|float $amount, Currency $currency, ?string $locale = null): string
    {
        $decimals = $currency->decimalPlaces();
        $number = self::nombre($amount, $locale ?? $currency->locale(), $decimals, $decimals);

        return $currency->position() === 'before'
            ? $currency->symbol().$number
            : $number."\u{00A0}".$currency->symbol();
    }

    /**
     * TCK-2794 — LE point de passage d'un nombre rendu en texte par l'API : un montant (sans son
     * symbole), ou un compte qu'une personne lit. Les groupes de milliers sortent en
     * {@see self::ESPACE_DE_GROUPE} quand la langue les sépare par une espace (U+202F, U+00A0,
     * U+0020…) ; une virgule ou un point de groupe (`en`) ne bouge pas, ni le séparateur décimal.
     *
     * `$min`/`$max` bornent les décimales ; `null` garde celle d'ICU (0 à 3 décimales).
     */
    public static function nombre(int|float $value, string $locale, ?int $min = null, ?int $max = null): string
    {
        $formatter = new NumberFormatter(self::localeDeRendu($locale), NumberFormatter::DECIMAL);
        if ($min !== null) {
            $formatter->setAttribute(NumberFormatter::MIN_FRACTION_DIGITS, $min);
        }
        if ($max !== null) {
            $formatter->setAttribute(NumberFormatter::MAX_FRACTION_DIGITS, $max);
        }
        // TCK-726 (P26.02) — sans mode réglé, ICU arrondit au pair : 18 004,5 de TVA s'imprimait
        // 18 004 sous un total de 118 030, et 1 250,5 s'imprimait 1 250 quand `round()`
        // (PHP_ROUND_HALF_UP) en encaisse 1 251. Le demi s'éloigne de zéro, comme à l'encaissement
        // et comme le `formatCurrency` du front (`Intl.NumberFormat`, `halfExpand`).
        $formatter->setAttribute(NumberFormatter::ROUNDING_MODE, NumberFormatter::ROUND_HALFUP);
        // Seul le symbole de GROUPE change : l'espace d'avant le symbole monétaire (posée par
        // `format()`) et la virgule décimale gardent leur caractère.
        if (preg_match('/^\s$/u', (string) $formatter->getSymbol(NumberFormatter::GROUPING_SEPARATOR_SYMBOL)) === 1) {
            $formatter->setSymbol(NumberFormatter::GROUPING_SEPARATOR_SYMBOL, self::ESPACE_DE_GROUPE);
        }

        $number = $formatter->format((float) $value);

        return $number !== false
            ? $number
            : number_format((float) $value, $max ?? 0, ',', self::ESPACE_DE_GROUPE);
    }

    /**
     * La langue des séparateurs. `wo` rend du `fr_SN`, comme au front (`takussan-web/src/lib/format.ts`,
     * `toCurrencyLocale`) : les données CLDR de `wo` groupent par un POINT (« 1.482.166 »), que
     * personne n'écrit au Sénégal.
     */
    private static function localeDeRendu(string $locale): string
    {
        return preg_match('/^wo(?:[_-]|$)/i', $locale) === 1 ? 'fr_SN' : $locale;
    }

    /**
     * Parse a localised currency string back to a float. Strips the symbol
     * and any group/decimal separators introduced by `format()`. Returns 0.0
     * for unparseable input (callers should validate upstream).
     */
    public function parse(string $value, Currency $currency, ?string $locale = null): float
    {
        $effectiveLocale = self::localeDeRendu($locale ?? $currency->locale());

        // Strip the symbol first so the parser only sees the number.
        $sanitized = str_replace($currency->symbol(), '', $value);
        // Replace narrow / non-breaking spaces by a regular space so ICU
        // recognises the thousands grouping. TCK-2794 — U+202F reste lu : un montant copié d'un
        // ancien PDF ou d'un SMS d'avant l'insécable se relit comme avant.
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
