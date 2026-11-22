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

    /**
     * TCK-954 (ADR-0070 § 3) — `••••` si une valeur est saisie, `null` sinon. Aucun caractère n'est
     * gardé : les derniers chiffres d'un montant laissent deviner son ordre de grandeur.
     */
    public static function presence(mixed $value): ?string
    {
        return $value === null || trim((string) $value) === '' ? null : str_repeat(self::BULLET, 4);
    }

    /**
     * TCK-2609 (ADR-0094 §2) — `awa.diop@gmail.com` → `a•••@gmail.com` : la première lettre et le
     * domaine, assez pour que le destinataire s'y reconnaisse, jamais l'adresse entière. Sans `@`,
     * rien n'est gardé.
     */
    public static function email(string $email): string
    {
        $clean = self::compact($email);
        $at = mb_strrpos($clean, '@');

        if ($at === false || $at === 0) {
            return str_repeat(self::BULLET, 3);
        }

        return mb_substr($clean, 0, 1).str_repeat(self::BULLET, 3).mb_substr($clean, $at);
    }

    /**
     * TCK-2609 (ADR-0094 §2) — `+221771234567` → `77 ••• 45 67` : l'indicatif de l'opérateur et les
     * quatre derniers chiffres du numéro national (l'indicatif `221` retiré), le reste masqué. Moins
     * de huit chiffres : tout est masqué, garder les bords les livrerait presque entiers.
     */
    public static function phone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) === 12 && str_starts_with($digits, '221')) {
            $digits = substr($digits, 3);
        }

        if (strlen($digits) < 8) {
            return str_repeat(self::BULLET, 4);
        }

        return substr($digits, 0, 2).' '.str_repeat(self::BULLET, 3).' '.substr($digits, -4, 2).' '.substr($digits, -2);
    }

    private static function compact(string $value): string
    {
        return preg_replace('/\s+/u', '', $value) ?? '';
    }
}
