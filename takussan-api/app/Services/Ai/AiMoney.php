<?php

namespace App\Services\Ai;

/**
 * TCK-2448 (ADR-0086) — l'argent du socle IA : des chaînes décimales, en dollars, calculées par
 * `bcmath` à l'échelle de leurs propres opérandes. Aucun nombre de décimales n'est choisi, et aucun
 * `float` ne passe ici : `(string) 4.0E-11` n'est pas un opérande valide, et `bcmath` le refuse.
 */
final class AiMoney
{
    /** Un montant : des chiffres, sans signe ni exposant. */
    public const SHAPE = '/^\d+(\.\d+)?$/';

    public const ZERO = '0';

    public static function isAmount(mixed $value): bool
    {
        return is_string($value) && preg_match(self::SHAPE, $value) === 1;
    }

    /** Le nombre de décimales écrites. */
    public static function scale(string $amount): int
    {
        $point = strpos($amount, '.');

        return $point === false ? 0 : strlen($amount) - $point - 1;
    }

    /** La même valeur, sans zéro inutile : `2.50` rend `2.5`, `4.00` rend `4`, `0.00` rend `0`. */
    public static function canonical(string $amount): string
    {
        if (str_contains($amount, '.')) {
            $amount = rtrim(rtrim($amount, '0'), '.');
        }
        $amount = ltrim($amount, '0');

        return match (true) {
            $amount === '' => self::ZERO,
            str_starts_with($amount, '.') => '0'.$amount,
            default => $amount,
        };
    }

    public static function add(string $a, string $b): string
    {
        return self::canonical(bcadd($a, $b, max(self::scale($a), self::scale($b))));
    }

    /** -1, 0 ou 1 : exact au dernier chiffre de l'un comme de l'autre. */
    public static function compare(string $a, string $b): int
    {
        return bccomp($a, $b, max(self::scale($a), self::scale($b)));
    }
}
