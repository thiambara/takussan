<?php

namespace App\Services\Utils\Traits;

trait _FormatPhone
{
    /**
     * format phones number to international format
     *
     * @param array|string $phones
     * @param bool $withPlus
     * @return array|string
     */
    public static function formatPhones(array|string $phones, bool $withPlus = true): array|string
    {
        if (!is_array($phones)) {
            return self::formatOnePhone($phones, $withPlus);
        }
        return array_map(fn($phone) => self::formatOnePhone($phone, $withPlus), $phones);
    }

    // PRIVATE METHODS
    private static function formatOnePhone(string $phone, bool $withPlus = true): string
    {
        $phone = self::normalizeTelephoneNumber($phone);

        $countriesPhonesInfos = [
            '221' => ['length' => 9, 'prefixes' => ['77', '78', '76', '70', '75']], // Senegal
            '1' => ['length' => 10], // United States
            '44' => ['length' => 10], // United Kingdom
        ];

        // Check if the phone number is already in international format
        if (preg_match('/^\+|^00/', $phone)) {
            return $withPlus ? preg_replace('/^00/', '+', $phone) : preg_replace('/^\+|^00/', '', $phone);
        }

        $length = strlen($phone);

        $_phone1 = null;
        $_phone2 = null;
        $_phone3 = null;

        foreach ($countriesPhonesInfos as $code => $info) {
            $phoneLength = $info['length'];
            $prefixes = $info['prefixes'] ?? [];

            // Check if the phone number is in the format of the country
            if (str_starts_with($phone, $code) && $length === strlen($code) + $phoneLength) {
                if (array_filter($prefixes, fn($prefix) => str_starts_with(substr($phone, strlen($code)), $prefix))) {
                    return ($withPlus ? '+' : '') . $phone;
                } else if (empty($prefixes)) {
                    $_phone1 ??= $phone;
                }
            }

            // Check if the phone number is in the format of the country without the code
            if ($length === $phoneLength) {
                if (array_filter($prefixes, fn($prefix) => str_starts_with($phone, $prefix))) {
                    $_phone2 ??= $code . $phone;
                } else if (empty($prefixes)) {
                    $_phone3 ??= $phone;
                }
            }
        }

        // If the phone number is not in the format of any country, return it as it is
        return ($withPlus ? '+' : '') . ($_phone1 ?? $_phone2 ?? $_phone3 ?? $phone);
    }

    private static function normalizeTelephoneNumber(string $telephone): string
    {
        return str_replace([' ', '.', '-', '(', ')'], '', $telephone);
    }
}
