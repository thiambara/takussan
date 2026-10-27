<?php

namespace App\Services\Radar;

use App\Models\Enums\RentPeriod;
use App\Support\PhoneMasker;

/**
 * TCK-2386 (ADR-0077 §5, AC4) — le prix d'une annonce tel qu'écrit, lu par du code : le modèle
 * recopie « 1M5 » ou « 450.000f/mois », ce parseur rend 1 500 000 XOF ou 450 000 XOF par mois.
 *
 * Formes lues, dans cet ordre de priorité à une même position du texte :
 *   - million abrégé à la sénégalaise : « 1M5 » = 1,5 million, « 2M250 » = 2,25 millions ;
 *   - nombre (décimale `.` ou `,`) suivi d'un multiplicateur : « 1,5M », « 1.5 million(s) »,
 *     « 45 millions », « 350K », « 350 mille », « 2 milliards » ;
 *   - nombre groupé par milliers (espace, point, virgule) : « 450.000 », « 25 000 000 » ;
 *   - nombre nu : « 5000 ».
 * Le premier montant du texte l'emporte. La période ({@see RentPeriod}) vient du premier mot de
 * période trouvé : « /mois », « par jour », « nuitée », « semaine », « /an »… — sinon `null`.
 *
 * Calcul entier de bout en bout (aucun flottant) ; au-delà de 15 chiffres, ou à zéro, le texte
 * n'est pas un prix : `null`. Chiffres arabes et pleine chasse repliés par
 * {@see PhoneMasker::normalizeDigits()}, comme pour les numéros.
 */
final class RadarAmountParser
{
    /** Au-delà, ce n'est plus un prix immobilier mais du bruit (et `int` déborderait vers 19). */
    private const MAX_DIGITS = 15;

    /** Puissance de dix de chaque multiplicateur. */
    private const MULTIPLIERS = [
        'milliard' => 9, 'milliards' => 9, 'md' => 9, 'mds' => 9, 'mrd' => 9, 'mrds' => 9,
        'million' => 6, 'millions' => 6, 'm' => 6,
        'mille' => 3, 'k' => 3,
    ];

    private const AMOUNT = '/(?<mshort>(?<mint>\d+)\s?m(?<mfrac>\d{1,3})(?!\d))'
        .'|(?<mult>(?<num>\d+(?:[.,]\d+)?)\s*(?<unit>milliards?|mrds?|mds?|millions?|mille|m|k)(?![\p{L}\d²]))'
        .'|(?<grouped>\d{1,3}(?:[ .,]\d{3})+(?!\d))'
        .'|(?<plain>\d+)/u';

    /** Le premier mot de période du texte l'emporte. */
    private const PERIODS = [
        'daily' => '/(?<![\p{L}])(?:jours?|journ[ée]es?|journali[eè]re?|nuits?|nuit[ée]es?|j)(?![\p{L}])/u',
        'weekly' => '/(?<![\p{L}])(?:semaines?|sem|hebdo(?:madaire)?)(?![\p{L}])/u',
        'monthly' => '/(?<![\p{L}])(?:mois|mensuel(?:le)?|mensualit[ée])(?![\p{L}])/u',
        'yearly' => '/(?<![\p{L}])(?:an|ans|ann[ée]es?|annuel(?:le)?)(?![\p{L}])/u',
    ];

    /** @return array{amount: int, period: ?string}|null */
    public static function parse(string $text): ?array
    {
        $normalized = self::normalize($text);
        if ($normalized === '' || preg_match(self::AMOUNT, $normalized, $m) !== 1) {
            return null;
        }

        $amount = match (true) {
            ($m['mshort'] ?? '') !== '' => self::scaled($m['mint'], $m['mfrac'], 6),
            ($m['mult'] ?? '') !== '' => self::multiplied($m['num'], $m['unit']),
            ($m['grouped'] ?? '') !== '' => self::digits((string) preg_replace('/[ .,]/', '', $m['grouped'])),
            default => self::digits($m['plain'] ?? ''),
        };

        if ($amount === null || $amount <= 0) {
            return null;
        }

        return ['amount' => $amount, 'period' => self::period($normalized)];
    }

    private static function normalize(string $text): string
    {
        $text = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text));
        // Séparateurs arabes : ٫ est la décimale, ٬ le groupement des milliers.
        $text = strtr($text, ['٫' => '.', '٬' => ',']);
        $text = (string) preg_replace('/[\s\x{00A0}\x{202F}\x{2009}\x{3000}]+/u', ' ', $text);

        return trim(mb_strtolower($text));
    }

    private static function multiplied(string $number, string $unit): ?int
    {
        $parts = preg_split('/[.,]/', $number, 2) ?: [$number];

        return self::scaled($parts[0], $parts[1] ?? '', self::MULTIPLIERS[$unit]);
    }

    /** `$integer`,`$fraction` × 10^`$power`, en entiers : la fraction au-delà de la puissance est tronquée. */
    private static function scaled(string $integer, string $fraction, int $power): ?int
    {
        $integer = ltrim($integer, '0');
        $fraction = substr(str_pad($fraction, $power, '0'), 0, $power);

        return self::digits($integer.$fraction);
    }

    private static function digits(string $digits): ?int
    {
        $digits = ltrim($digits, '0');
        if ($digits === '' || strlen($digits) > self::MAX_DIGITS || ! ctype_digit($digits)) {
            return null;
        }

        return (int) $digits;
    }

    private static function period(string $text): ?string
    {
        $found = null;
        $at = PHP_INT_MAX;
        foreach (self::PERIODS as $period => $pattern) {
            if (preg_match($pattern, $text, $m, PREG_OFFSET_CAPTURE) === 1 && $m[0][1] < $at) {
                $at = $m[0][1];
                $found = $period;
            }
        }

        return $found === null ? null : RentPeriod::from($found)->value;
    }
}
