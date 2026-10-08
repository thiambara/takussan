<?php

namespace App\Support;

/**
 * TCK-601 (ADR-0044 §1) — la forme MASQUÉE d'un identifiant sensible, écrite une fois.
 *
 * Toute forme masquée du dépôt passe par ici : un RIB affiché au carnet de propriétaires, l'IBAN
 * d'un relevé bancaire, l'identifiant d'un moyen de versement (TCK-594, `PayoutMethod::mask()`,
 * qui s'y ramène en une ligne). Deux masqueurs qui divergent montrent, à eux deux, plus que chacun.
 *
 * Aucun format n'est supposé (D-68 : pas de contrôle de forme) : on retire les blancs, on garde
 * quelques caractères aux bords, et on remplace le reste par `•`.
 */
final class Masking
{
    private const BULLET = '•';

    /**
     * `SN0123456789` → `SN•• •••• ••89` : le code pays et les deux derniers caractères, par blocs
     * de quatre. Moins de cinq caractères : tout est masqué, garder les bords les livrerait entiers.
     */
    public static function iban(string $iban): string
    {
        $clean = mb_strtoupper(self::compact($iban));
        $length = mb_strlen($clean);

        if ($length < 5) {
            return str_repeat(self::BULLET, $length);
        }

        $masked = mb_substr($clean, 0, 2)
            .str_repeat(self::BULLET, $length - 4)
            .mb_substr($clean, -2);

        return implode(' ', mb_str_split($masked, 4));
    }

    /**
     * `NINEA-1234567` → `•••• 4567` : les `$visible` derniers caractères seulement. Une valeur
     * trop courte pour en garder autant est entièrement masquée.
     */
    public static function tail(string $value, int $visible = 4): string
    {
        $clean = self::compact($value);

        if (mb_strlen($clean) <= $visible) {
            return str_repeat(self::BULLET, 4);
        }

        return str_repeat(self::BULLET, 4).' '.mb_substr($clean, -$visible);
    }

    private static function compact(string $value): string
    {
        return preg_replace('/\s+/u', '', $value) ?? '';
    }
}
