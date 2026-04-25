<?php

namespace App\Models\Enums;

/**
 * TCK-084 — Currency enum with formatting metadata.
 *
 * Each case carries:
 *  - the display symbol (e.g. "F CFA", "€", "$")
 *  - the number of decimal places used by the smallest unit
 *  - the BCP-47 / ICU locale used as the default formatter locale
 *  - the symbol position relative to the amount ("before" or "after")
 *
 * Conversion between currencies is intentionally NOT covered here — V1 stores
 * and renders amounts per agency without any FX. See the ticket "Hors
 * périmètre" section.
 */
enum Currency: string
{
    case XOF = 'XOF';
    case XAF = 'XAF';
    case EUR = 'EUR';
    case USD = 'USD';

    /**
     * Human-readable currency symbol used on screen and inside PDF templates.
     * `XOF` keeps the verbose "F CFA" form because the tighter Unicode CFA
     * symbol (U+20A3 ₣) is not universally rendered by PDF fonts.
     */
    public function symbol(): string
    {
        return match ($this) {
            self::XOF, self::XAF => 'F CFA',
            self::EUR => '€',
            self::USD => '$',
        };
    }

    /**
     * Decimal places used at display time. XOF/XAF have no sub-unit so we
     * format with 0 fraction digits even when the column type is decimal.
     */
    public function decimalPlaces(): int
    {
        return match ($this) {
            self::XOF, self::XAF => 0,
            self::EUR, self::USD => 2,
        };
    }

    /**
     * Default locale tag used for grouping/decimal separators. Callers can
     * override at format-time when they really need a different locale (e.g.
     * an English-speaking landlord billing in EUR).
     */
    public function locale(): string
    {
        return match ($this) {
            self::XOF => 'fr_SN',
            self::XAF => 'fr_CM',
            self::EUR => 'fr_FR',
            self::USD => 'en_US',
        };
    }

    /**
     * Where to place the symbol relative to the formatted number. The PDF
     * layouts and the frontend `<Money>` component both rely on this hint to
     * stay locale-aligned without re-parsing ICU output.
     */
    public function position(): string
    {
        return match ($this) {
            self::XOF, self::XAF, self::EUR => 'after',
            self::USD => 'before',
        };
    }

    /**
     * Default fallback for new agencies and any legacy row whose `currency`
     * column is somehow null — Senegal-first.
     */
    public static function default(): self
    {
        return self::XOF;
    }
}
