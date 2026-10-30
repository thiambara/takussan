<?php

namespace App\Services\Radar;

use App\Models\Enums\RentPeriod;
use App\Support\PhoneMasker;
use App\Support\RadarPhone;

/**
 * TCK-2386 (ADR-0077 §5, AC4) — le prix d'une annonce tel qu'écrit, lu par du code : le modèle
 * recopie « 1M5 » ou « 450.000f/mois », ce parseur rend 1 500 000 XOF ou 450 000 XOF par mois.
 *
 * **Les candidats.** Chaque nombre du texte qui n'est pas collé à une lettre ni à un `+` (« T3 »,
 * « F4 », « R+1 » ne sont pas des montants), sous l'une de ces formes :
 *   - million abrégé à la sénégalaise : « 1M5 », « 1 M 5 » = 1,5 million, « 2M250 » = 2,25 millions
 *     — sauf « m2 »/« m3 » à un chiffre, qui sont une surface ou un volume (« 300m2 ») ;
 *   - nombre (décimale `.` ou `,`, ou groupé par milliers) suivi d'un multiplicateur : « 1,5M »,
 *     « 1.5 million(s) », « 45 millions », « 350K », « 350 mille », « 1 000 K », « 2 milliards » ;
 *   - nombre groupé par milliers (espace, point, virgule) : « 450.000 », « 25 000 000 » ;
 *   - nombre nu : « 5000 ». Une décimale sans multiplicateur (« 1.5 ») n'est pas un montant.
 *
 * **Les écartés.** Un nombre suivi d'une unité qui n'est pas une monnaie (« 300 m² », « 3 chambres »,
 * « 5 ans », « 2 mois » — une durée, pas une période : la période s'écrit « /mois », « par mois »),
 * et un nombre qui fait partie d'un numéro de téléphone que le masquage voit, sénégalais, étranger ou
 * lien WhatsApp ({@see PhoneMasker::MASK_PATTERN}, TCK-2412 : `0033612345678` n'est pas un prix).
 *
 * **Le choix.**
 *   - Une fourchette (« 350 000 - 400 000 F », « de 350 000 à 400 000 F » : un nombre sans marque,
 *     un tiret, « à » ou « au », puis un nombre marqué) → `null` : aucun des deux n'est LE prix.
 *   - Un candidat précédé, à deux mots près, de « caution », « avance », « dépôt » ou « garantie »
 *     est écarté s'il en reste un autre : c'est un dépôt, pas le prix.
 *   - Un seul candidat restant → lui. Plusieurs → le premier qui porte une période attachée, sinon
 *     le premier qui porte une marque (monnaie « F », « FCFA », « XOF », « francs », ou un
 *     multiplicateur). Le premier et non le plus grand : à côté d'un loyer, l'autre montant est
 *     presque toujours une caution ou une avance, plus grande. Plusieurs candidats sans marque →
 *     `null` : le code ne devine pas, l'humain tranche (`unparsed_amount`).
 *
 * **La période** ({@see RentPeriod}) est celle qui suit le montant retenu, après sa monnaie et/ou un
 * lien (« / », « par », « le », « la », « l' ») : « 450.000f/mois », « 25 000 la nuitée »,
 * « 3 000 000/an ». Un « 2 mois » ailleurs dans le texte n'en est pas une.
 *
 * Calcul entier de bout en bout (aucun flottant) ; au-delà de 15 chiffres, ou à zéro, le nombre
 * n'est pas un prix. Chiffres arabes et pleine chasse repliés par
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

    /** Pas collé à une lettre, à un `+` ni au milieu d'un nombre. */
    private const CANDIDATE = '/(?<![\p{L}\d+])(?<!\d[.,])(?:'
        .'(?<mshort>(?<mint>\d+)\s?m\s?(?![23](?!\d))(?<mfrac>\d{1,3})(?!\d))'
        .'|(?<mult>(?<num>\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(?<unit>milliards?|mrds?|mds?|millions?|mille|m|k)(?![\p{L}\d²³]))'
        .'|(?<grouped>\d{1,3}(?:[ .,]\d{3})+(?![.,]?\d))'
        .'|(?<plain>\d+(?![.,]?\d))'
        .')/u';

    private const CURRENCY = '(?:francs?\s?cfa|f\s?cfa|fcfa|cfa|xof|francs?|frs?|f)(?![\p{L}])';

    /** Ce qui, collé derrière un nombre, en fait autre chose qu'un montant. */
    private const UNIT = '/^\s*(?:m²|m³|m2|m3|m|mètres?|metres?|ml|cm|km|ha|hectares?|chambres?|chbres?|ch|pi[eè]ces?|pcs?'
        .'|salles?|sdb|toilettes?|wc|douches?|lits?|places?|[ée]tages?|niveaux?|ans?|ann[ée]es?|mois|jours?|semaines?'
        .'|nuits?|nuit[ée]es?|minutes?|min|mn|personnes?|appartements?|apparts?|appts?|studios?|villas?|%)(?![\p{L}])/u';

    /** Une période attachée : monnaie et/ou lien obligatoire (« 2 mois » nu est une durée). */
    private const PERIOD = '/^\s*(?<cur>'.self::CURRENCY.')?\s*(?<link>\/|par|chaque|le|la|l\')?\s*(?:'
        .'(?<daily>jours?|journ[ée]es?|nuits?|nuit[ée]es?|j)'
        .'|(?<weekly>semaines?|sem|hebdo(?:madaire)?)'
        .'|(?<monthly>mois|mensuel(?:le)?)'
        .'|(?<yearly>an|ann[ée]es?|annuel(?:le)?))(?![\p{L}])/u';

    /** Les mots qui font d'un montant un dépôt : jusqu'à deux mots entre eux et le nombre (« avance 3 mois : »). */
    private const DEPOSIT_BEFORE = '/(?<![\p{L}])(?:cautions?|avances?|d[ée]p[oô]ts?|garanties?)(?![\p{L}])(?:\s+\S+){0,2}?\s*[:=-]?\s*$/u';

    /** Ce qui sépare les deux bornes d'une fourchette. */
    private const RANGE_BETWEEN = '/^\s*(?:[-–—]|à|au|a)\s*$/u';

    /** @return array{amount: int, period: ?string}|null */
    public static function parse(string $text): ?array
    {
        $normalized = self::normalize($text);
        if ($normalized === '' || preg_match_all(self::CANDIDATE, $normalized, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE | PREG_UNMATCHED_AS_NULL) < 1) {
            return null;
        }

        $phones = self::phoneSpans($normalized);
        $plausible = [];
        foreach ($matches as $m) {
            $candidate = self::candidate($m, $normalized, $phones);
            if ($candidate !== null) {
                $plausible[] = $candidate;
            }
        }

        for ($i = 0; $i + 1 < count($plausible); $i++) {
            [$low, $high] = [$plausible[$i], $plausible[$i + 1]];
            $between = substr($normalized, $low['end'], $high['start'] - $low['end']);
            if (! $low['marked'] && $high['marked'] && preg_match(self::RANGE_BETWEEN, $between) === 1) {
                return null;
            }
        }

        $notDeposits = array_values(array_filter($plausible, static fn (array $c): bool => ! $c['deposit']));
        if ($notDeposits !== []) {
            $plausible = $notDeposits;
        }

        $chosen = match (true) {
            count($plausible) === 1 => $plausible[0],
            default => array_values(array_filter($plausible, static fn (array $c): bool => $c['period'] !== null))[0]
                ?? array_values(array_filter($plausible, static fn (array $c): bool => $c['marked']))[0]
                ?? null,
        };

        return $chosen === null ? null : ['amount' => $chosen['amount'], 'period' => $chosen['period']];
    }

    /**
     * @param  array<int|string, array{0: ?string, 1: int}>  $m
     * @param  list<array{int, int}>  $phones
     * @return array{amount: int, period: ?string, marked: bool, deposit: bool, start: int, end: int}|null
     */
    private static function candidate(array $m, string $text, array $phones): ?array
    {
        [$match, $start] = $m[0];
        $end = $start + strlen((string) $match);
        foreach ($phones as [$from, $to]) {
            if ($start < $to && $end > $from) {
                return null;
            }
        }

        $after = substr($text, $end, 60);
        $multiplied = $m['mshort'][0] !== null || $m['mult'][0] !== null;
        if (! $multiplied && preg_match(self::UNIT, $after) === 1) {
            return null;
        }

        $amount = match (true) {
            $m['mshort'][0] !== null => self::scaled((string) $m['mint'][0], (string) $m['mfrac'][0], 6),
            $m['mult'][0] !== null => self::multiplied((string) $m['num'][0], (string) $m['unit'][0]),
            $m['grouped'][0] !== null => self::digits((string) preg_replace('/[ .,]/', '', (string) $m['grouped'][0])),
            default => self::digits((string) $m['plain'][0]),
        };
        if ($amount === null || $amount <= 0) {
            return null;
        }

        $period = self::period($after);

        return [
            'amount' => $amount,
            'period' => $period,
            'marked' => $multiplied || $period !== null || preg_match('/^\s*'.self::CURRENCY.'/u', $after) === 1,
            'deposit' => preg_match(self::DEPOSIT_BEFORE, substr($text, max(0, $start - 60), min($start, 60))) === 1,
            'start' => $start,
            'end' => $end,
        ];
    }

    /** @return list<array{int, int}> les plages d'octets des numéros de téléphone du texte */
    private static function phoneSpans(string $text): array
    {
        // Le `+` d'un étage (`R+1 1 250 500 750 F`) n'est pas un indicatif (TCK-2412) ; un octet pour un, les plages restent justes.
        $text = RadarPhone::withoutFloorPlus($text);
        if (preg_match_all(PhoneMasker::MASK_PATTERN, $text, $found, PREG_OFFSET_CAPTURE) < 1) {
            return [];
        }

        // L'indicatif écrit devant la plage en fait partie : `0033 7 7 1 2 …` ne laisse pas un « prix » de 33.
        return array_map(static fn (array $f): array => [RadarPhone::prefixStart(substr($text, 0, $f[1])) ?? $f[1], $f[1] + strlen($f[0])], $found[0]);
    }

    private static function normalize(string $text): string
    {
        $text = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text));
        // Séparateurs arabes : ٫ est la décimale, ٬ le groupement des milliers.
        $text = strtr($text, ['٫' => '.', '٬' => ',', '’' => "'", 'ʼ' => "'"]);
        $text = (string) preg_replace('/[\s\x{00A0}\x{202F}\x{2009}\x{3000}]+/u', ' ', $text);

        return trim(mb_strtolower($text));
    }

    private static function multiplied(string $number, string $unit): ?int
    {
        // « 1 000 K » : un nombre groupé par milliers n'a pas de décimale.
        if (preg_match('/^\d{1,3}(?:[ .]\d{3})+$/', $number) === 1) {
            return self::scaled((string) preg_replace('/[ .]/', '', $number), '', self::MULTIPLIERS[$unit]);
        }
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

    private static function period(string $after): ?string
    {
        if (preg_match(self::PERIOD, $after, $m, PREG_UNMATCHED_AS_NULL) !== 1 || ($m['cur'] === null && $m['link'] === null)) {
            return null;
        }
        foreach (['daily', 'weekly', 'monthly', 'yearly'] as $period) {
            if ($m[$period] !== null) {
                return RentPeriod::from($period)->value;
            }
        }

        return null;
    }
}
