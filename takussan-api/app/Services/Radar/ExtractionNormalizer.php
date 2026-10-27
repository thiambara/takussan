<?php

namespace App\Services\Radar;

use App\Ai\Agents\RadarExtraction;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarConfidence;
use App\Models\Enums\RentPeriod;
use App\Support\PhoneMasker;
use App\Support\RadarPhone;

/**
 * TCK-2386 (ADR-0077 §5, AC3, AC4, AC5) — la sortie de `radar.extraction` relue par du code avant
 * d'être enregistrée (`radar_listings.extracted`). Le modèle recopie et déclare ; ce service
 * convertit, confronte et rabaisse — il ne fait jamais monter une confiance.
 *
 * Forme rendue (stable, sérialisable en JSON ; la lisent l'enregistrement et la console) :
 *   - une entrée par champ de {@see RadarExtraction::PROPERTY_FIELDS} et
 *     {@see RadarExtraction::ADVERTISER_FIELDS} : `{value, confidence, evidence, flags}` ;
 *     `price` y ajoute `{raw, period}` (`value` = montant entier en XOF), `neighborhood`
 *     `{neighborhood_id, suggestions}` ;
 *   - `phones` : E.164, les invalides tombent ; `nature_signals` : `{signal, evidence}`.
 *
 * Règles :
 *   - un champ rendu SANS passage cité tombe à la confiance la plus basse (AC3,
 *     `evidence_missing`) ; un passage introuvable dans le texte source aussi
 *     (`evidence_not_in_source`, comparaison après repli de la casse, des blancs, des apostrophes
 *     et des chiffres) — sans texte source (captures), la présence n'est pas contrôlée. Un champ
 *     sans valeur (null, ou `unknown` pour la nature de l'annonceur) n'a rien à justifier : pas de
 *     drapeau, confiance `low` ;
 *   - `price` est lu par {@see RadarAmountParser} (`unparsed_amount` s'il n'en sort rien) ;
 *     `rent_period` absente se déduit de la période du prix ;
 *   - les bornes de `config('radar.bounds')` (`out_of_bounds`) ; la valeur reste, l'humain tranche ;
 *   - une valeur d'enum ou de type inattendu devient `null` (`unknown` pour la nature), drapeau
 *     `invalid_value` ;
 *   - le quartier est rapproché du référentiel par {@see RadarNeighborhoodMatcher}, jamais par
 *     l'IA (ADR-0062).
 * Tout drapeau force la confiance à `low`.
 */
final class ExtractionNormalizer
{
    public const FLAG_EVIDENCE_MISSING = 'evidence_missing';

    public const FLAG_EVIDENCE_NOT_IN_SOURCE = 'evidence_not_in_source';

    public const FLAG_OUT_OF_BOUNDS = 'out_of_bounds';

    public const FLAG_INVALID_VALUE = 'invalid_value';

    public const FLAG_UNPARSED_AMOUNT = 'unparsed_amount';

    public function __construct(private readonly RadarNeighborhoodMatcher $matcher) {}

    /**
     * @param  array<string, mixed>  $raw  la sortie structurée de {@see RadarExtraction}
     * @return array<string, mixed>
     */
    public function normalize(array $raw, ?string $sourceText): array
    {
        $source = $sourceText !== null && trim($sourceText) !== '' ? self::fold($sourceText) : null;

        $out = [];
        foreach ([...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS] as $field) {
            $out[$field] = $this->field($field, $raw[$field] ?? null, $source);
        }

        $out['price'] = $this->boundPrice($out['price'], $out['contract']['value'], $out['rent_period']['value']);
        if ($out['rent_period']['value'] === null && $out['price']['period'] !== null) {
            $out['rent_period'] = [
                'value' => $out['price']['period'],
                'confidence' => $out['price']['confidence'],
                'evidence' => $out['price']['evidence'],
                'flags' => [],
            ];
        }

        $out['neighborhood'] += $out['neighborhood']['value'] === null
            ? ['neighborhood_id' => null, 'suggestions' => []]
            : $this->matcher->match($out['neighborhood']['value'], $out['city']['value']);

        $out['phones'] = $this->phones($raw['phones'] ?? null);
        $out['nature_signals'] = $this->natureSignals($raw['nature_signals'] ?? null);

        return $out;
    }

    /** @return array{value: mixed, confidence: string, evidence: ?string, flags: list<string>} */
    private function field(string $field, mixed $entry, ?string $source): array
    {
        $entry = is_array($entry) ? $entry : [];
        $rawValue = $entry['value'] ?? null;
        $evidence = is_string($entry['evidence'] ?? null) && trim($entry['evidence']) !== '' ? trim($entry['evidence']) : null;
        $confidence = RadarConfidence::tryFrom(is_string($entry['confidence'] ?? null) ? $entry['confidence'] : '') ?? RadarConfidence::lowest();

        [$value, $flags, $extra] = $this->value($field, $rawValue);

        $present = $rawValue !== null && $rawValue !== '' && $rawValue !== []
            && ! ($field === 'advertiser_nature' && $rawValue === RadarAdvertiserNature::Unknown->value);
        if ($present && $evidence === null) {
            array_unshift($flags, self::FLAG_EVIDENCE_MISSING);
        } elseif ($present && $source !== null && ! str_contains($source, self::fold((string) $evidence))) {
            array_unshift($flags, self::FLAG_EVIDENCE_NOT_IN_SOURCE);
        }

        return [
            'value' => $value,
            'confidence' => ($flags !== [] || ! $present ? RadarConfidence::lowest() : $confidence)->value,
            'evidence' => $evidence,
            'flags' => $flags,
        ] + $extra;
    }

    /**
     * La valeur d'un champ, convertie et contrôlée.
     *
     * @return array{0: mixed, 1: list<string>, 2: array<string, mixed>}
     */
    private function value(string $field, mixed $value): array
    {
        return match ($field) {
            'property_type' => $this->enum($value, array_column(PropertyType::cases(), 'value')),
            'contract' => $this->enum($value, RadarExtraction::CONTRACTS),
            'rent_period' => $this->enum($value, array_column(RentPeriod::cases(), 'value')),
            'price' => $this->price($value),
            'bedrooms', 'bathrooms' => $this->integer($value, $field),
            'surface_m2' => $this->number($value, 'surface_m2'),
            'furnished' => $value === null || is_bool($value) ? [$value, [], []] : [null, [self::FLAG_INVALID_VALUE], []],
            'amenities' => $this->strings($value),
            'advertiser_nature' => $this->nature($value),
            default => $this->string($value),
        };
    }

    /**
     * @param  list<string>  $allowed
     * @return array{0: ?string, 1: list<string>, 2: array{}}
     */
    private function enum(mixed $value, array $allowed): array
    {
        if ($value === null) {
            return [null, [], []];
        }

        return is_string($value) && in_array($value, $allowed, true) ? [$value, [], []] : [null, [self::FLAG_INVALID_VALUE], []];
    }

    /** @return array{0: string, 1: list<string>, 2: array{}} */
    private function nature(mixed $value): array
    {
        if ($value === null) {
            return [RadarAdvertiserNature::Unknown->value, [], []];
        }
        $nature = is_string($value) ? RadarAdvertiserNature::tryFrom($value) : null;

        return $nature === null
            ? [RadarAdvertiserNature::Unknown->value, [self::FLAG_INVALID_VALUE], []]
            : [$nature->value, [], []];
    }

    /** @return array{0: ?string, 1: list<string>, 2: array{}} */
    private function string(mixed $value): array
    {
        if ($value === null) {
            return [null, [], []];
        }
        if (! is_string($value)) {
            return [null, [self::FLAG_INVALID_VALUE], []];
        }
        $value = trim($value);

        return [$value === '' ? null : $value, [], []];
    }

    /** @return array{0: ?list<string>, 1: list<string>, 2: array{}} */
    private function strings(mixed $value): array
    {
        if ($value === null) {
            return [null, [], []];
        }
        if (! is_array($value)) {
            return [null, [self::FLAG_INVALID_VALUE], []];
        }
        $items = array_filter(array_map(static fn (mixed $v): ?string => is_string($v) && trim($v) !== '' ? trim($v) : null, $value));

        return [array_values(array_unique($items)), [], []];
    }

    /** @return array{0: ?int, 1: list<string>, 2: array{}} */
    private function integer(mixed $value, string $bound): array
    {
        if ($value === null) {
            return [null, [], []];
        }
        $int = match (true) {
            is_int($value) => $value,
            is_float($value) && floor($value) === $value && abs($value) < PHP_INT_MAX => (int) $value,
            is_string($value) && preg_match('/^\s*-?\d{1,9}\s*$/', $value) === 1 => (int) $value,
            default => null,
        };
        if ($int === null) {
            return [null, [self::FLAG_INVALID_VALUE], []];
        }

        return [$int, $this->inBounds($int, config("radar.bounds.{$bound}")) ? [] : [self::FLAG_OUT_OF_BOUNDS], []];
    }

    /** @return array{0: int|float|null, 1: list<string>, 2: array{}} */
    private function number(mixed $value, string $bound): array
    {
        if ($value === null) {
            return [null, [], []];
        }
        if ((! is_int($value) && ! is_float($value) && ! (is_string($value) && is_numeric(trim($value)))) || is_nan((float) $value) || is_infinite((float) $value)) {
            return [null, [self::FLAG_INVALID_VALUE], []];
        }
        $number = is_string($value) ? (float) trim($value) : $value;
        if (is_float($number) && floor($number) === $number && abs($number) < PHP_INT_MAX) {
            $number = (int) $number;
        }

        return [$number, $this->inBounds($number, config("radar.bounds.{$bound}")) ? [] : [self::FLAG_OUT_OF_BOUNDS], []];
    }

    /**
     * Le prix lu dans son texte ; ses bornes se posent ensuite ({@see self::boundPrice()}), une fois
     * le contrat et la période connus.
     *
     * @return array{0: ?int, 1: list<string>, 2: array{raw: ?string, period: ?string}}
     */
    private function price(mixed $value): array
    {
        $raw = match (true) {
            is_string($value) => trim($value) === '' ? null : trim($value),
            is_int($value), is_float($value) => (string) $value,
            default => null,
        };
        if ($raw === null) {
            return [null, $value === null || $value === '' ? [] : [self::FLAG_INVALID_VALUE], ['raw' => null, 'period' => null]];
        }

        $parsed = RadarAmountParser::parse($raw);

        return $parsed === null
            ? [null, [self::FLAG_UNPARSED_AMOUNT], ['raw' => $raw, 'period' => null]]
            : [$parsed['amount'], [], ['raw' => $raw, 'period' => $parsed['period']]];
    }

    /**
     * Les bornes du prix : la vente si le contrat le dit ; un loyer si le contrat le dit ou si une
     * période est connue (période déclarée, sinon celle du prix, sinon mensuelle) ; sans contrat
     * ni période, rien ne permet de choisir une borne.
     *
     * @param  array<string, mixed>  $price
     * @return array<string, mixed>
     */
    private function boundPrice(array $price, mixed $contract, mixed $rentPeriod): array
    {
        if (! is_int($price['value'])) {
            return $price;
        }
        $period = is_string($rentPeriod) ? $rentPeriod : $price['period'];

        $bounds = match (true) {
            $contract === 'sale' => config('radar.bounds.sale'),
            $contract === 'rent' || $period !== null => $this->rentBounds($period ?? RentPeriod::Monthly->value),
            default => null,
        };
        if ($bounds === null || $this->inBounds($price['value'], $bounds)) {
            return $price;
        }

        $price['flags'][] = self::FLAG_OUT_OF_BOUNDS;
        $price['confidence'] = RadarConfidence::lowest()->value;

        return $price;
    }

    /**
     * Mensuel et journalier viennent de la configuration ; hebdomadaire et annuel s'en déduisent au
     * prorata du mensuel (× 12/52, × 12), arrondis à l'unité (config/radar.php, `bounds`).
     *
     * @return array{min: int, max: int}
     */
    private function rentBounds(string $period): array
    {
        $monthly = config('radar.bounds.rent.monthly');

        return match ($period) {
            RentPeriod::Daily->value => config('radar.bounds.rent.daily'),
            RentPeriod::Weekly->value => ['min' => (int) round($monthly['min'] * 12 / 52), 'max' => (int) round($monthly['max'] * 12 / 52)],
            RentPeriod::Yearly->value => ['min' => $monthly['min'] * 12, 'max' => $monthly['max'] * 12],
            default => $monthly,
        };
    }

    /** @param  array{min: int|float, max: int|float}|mixed  $bounds */
    private function inBounds(int|float $value, mixed $bounds): bool
    {
        return ! is_array($bounds) || ($value >= $bounds['min'] && $value <= $bounds['max']);
    }

    /** @return list<string> */
    private function phones(mixed $phones): array
    {
        if (! is_array($phones)) {
            return [];
        }
        $out = [];
        foreach ($phones as $phone) {
            $e164 = is_string($phone) ? RadarPhone::canonical($phone) : null;
            if ($e164 !== null) {
                $out[$e164] = true;
            }
        }

        return array_keys($out);
    }

    /** @return list<array{signal: string, evidence: ?string}> */
    private function natureSignals(mixed $signals): array
    {
        if (! is_array($signals)) {
            return [];
        }
        $out = [];
        foreach ($signals as $signal) {
            if (! is_array($signal) || ! is_string($signal['signal'] ?? null) || trim($signal['signal']) === '') {
                continue;
            }
            $evidence = $signal['evidence'] ?? null;
            $out[] = [
                'signal' => trim($signal['signal']),
                'evidence' => is_string($evidence) && trim($evidence) !== '' ? trim($evidence) : null,
            ];
        }

        return $out;
    }

    /** Le repli sous lequel un passage cité se cherche dans le texte source. */
    private static function fold(string $text): string
    {
        $text = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text));
        $text = strtr($text, ['’' => "'", 'ʼ' => "'", '‘' => "'"]);

        return trim((string) preg_replace('/[\s\x{00A0}\x{202F}\x{2009}]+/u', ' ', mb_strtolower($text)));
    }
}
