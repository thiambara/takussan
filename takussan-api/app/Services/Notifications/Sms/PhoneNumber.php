<?php

namespace App\Services\Notifications\Sms;

/**
 * TCK-102 — Minimal E.164 helper.
 *
 * The ticket lists `propaganistas/laravel-phone` as an acceptable
 * dependency, but we keep the surface area tiny here: validation +
 * country/national-prefix extraction. Plug in the package later if a
 * stricter parser is needed.
 */
final class PhoneNumber
{
    /**
     * Match `+` then 8–15 digits. Senegal MSISDNs are exactly 12 chars
     * (`+221` + 9 digits) but the regex stays permissive for foreign
     * numbers routed via the `default` fallback chain.
     */
    public const E164_REGEX = '/^\+[1-9]\d{7,14}$/';

    /**
     * TCK-574 — country codes with TWO digits (ITU zones 2 to 9). `+1` and `+7` have one; every
     * other code has three. ITU country codes form a prefix code, so this table is enough to
     * find where the country code ends. Mirrored by `takussan-web/src/lib/phone.ts`.
     *
     * @var list<string>
     */
    private const TWO_DIGIT_COUNTRY_CODES = [
        '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46',
        '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63',
        '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98',
    ];

    /**
     * TCK-574 — countries where the 0 right after the country code IS a digit of the number, not
     * a national trunk prefix: Italy (landlines, `+39 06 …`, Vatican included), San Marino
     * (`+378 0549 …`), Côte d'Ivoire (10-digit plan of 2021, `+225 07 …`), Benin (10-digit plan
     * of 2024-11-30, `+229 01 …`), Gabon (`+241 06 …`) and the Republic of the Congo
     * (`+242 06 …`). Same list as `INDICATIFS_A_ZERO_SIGNIFICATIF` on the front.
     *
     * @var list<string>
     */
    private const SIGNIFICANT_LEADING_ZERO = ['39', '378', '225', '229', '241', '242'];

    public static function isValid(string $number): bool
    {
        return preg_match(self::E164_REGEX, $number) === 1;
    }

    /**
     * Strict normalize: trim spaces only and verify shape. Throws on
     * malformed input — callers must validate before send().
     */
    public static function normalize(string $number): string
    {
        $clean = preg_replace('/\s+/', '', $number) ?? $number;
        if (! self::isValid($clean)) {
            throw new \InvalidArgumentException("Invalid E.164 phone number: {$number}");
        }

        return $clean;
    }

    /**
     * TCK-574 — true when a national trunk prefix `0` sits right after the country code
     * (`+33 0612345678`, dialled `06 12 34 56 78` in France). The number has the E.164 SHAPE,
     * but no network routes it. False outside E.164, and false where that 0 is significant.
     */
    public static function hasNationalTrunkPrefix(string $number): bool
    {
        if (preg_match('/^\+([1-9]\d+)$/', $number, $m) !== 1) {
            return false;
        }
        $digits = $m[1];
        $length = match (true) {
            $digits[0] === '1', $digits[0] === '7' => 1,
            in_array(substr($digits, 0, 2), self::TWO_DIGIT_COUNTRY_CODES, true) => 2,
            default => 3,
        };
        if (strlen($digits) <= $length) {
            return false;
        }

        return $digits[$length] === '0'
            && ! in_array(substr($digits, 0, $length), self::SIGNIFICANT_LEADING_ZERO, true);
    }

    /**
     * Country-code prefix (e.g. "+221"). Returns null if shape invalid.
     */
    public static function countryPrefix(string $number): ?string
    {
        if (! self::isValid($number)) {
            return null;
        }
        // Senegal is +221 — the only ITU country code we resolve operators
        // for. Other country codes return their +XX (1–3 digits) for
        // future routing tables.
        if (str_starts_with($number, '+221')) {
            return '+221';
        }

        // Best-effort: 3-digit fallback.
        return substr($number, 0, 4);
    }

    /**
     * Two-digit national prefix after the country code. Used by the
     * operator resolver. Returns null for non-+221 numbers.
     */
    public static function senegalNationalPrefix(string $number): ?string
    {
        if (! self::isValid($number) || ! str_starts_with($number, '+221')) {
            return null;
        }

        return substr($number, 4, 2);
    }
}
