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
