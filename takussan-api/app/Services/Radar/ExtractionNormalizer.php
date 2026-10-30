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
 *   - `phones` : E.164, les invalides tombent, et avec un texte source ceux qu'il ne porte pas
 *     aussi (`phones_flags` : `evidence_not_in_source`) ; ces derniers sont gardés à part dans
 *     `phones_dropped` (E.164, dédoublonnés, dans l'ordre du modèle ; `[]` pour des captures) ;
 *     `nature_signals` : `{signal, evidence}`.
 *
 * Règles :
 *   - un champ rendu SANS passage cité tombe à la confiance la plus basse (AC3,
 *     `evidence_missing`) ; un passage introuvable dans le texte source aussi
 *     (`evidence_not_in_source` ; repli NFC, casse, blancs, chiffres, séparateurs de milliers,
 *     blanc avant « : ; ! ? », tirets, apostrophes et guillemets ; un passage tronqué par « … » se cherche segment par segment, dans l'ordre ; à
 *     défaut, sans accents) — sans texte source (captures), la présence n'est pas contrôlée. Un champ
 *     sans valeur (null, ou `unknown` pour la nature de l'annonceur) n'a rien à justifier : pas de
 *     drapeau, confiance `low` ;
 *   - `price` est lu par {@see RadarAmountParser} (`unparsed_amount` s'il n'en sort rien) ; un
 *     nombre rendu tel quel est déjà en XOF (arrondi, `invalid_value` s'il n'est pas positif) ;
 *     `rent_period` absente se déduit de la période du prix, jamais pour une vente, sans effacer
 *     le drapeau d'une valeur invalide du modèle ;
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
        $source = $source === null ? null : ['folded' => $source, 'bare' => self::withoutAccents($source)];

        $out = [];
        foreach ([...RadarExtraction::PROPERTY_FIELDS, ...RadarExtraction::ADVERTISER_FIELDS] as $field) {
            $out[$field] = $this->field($field, $raw[$field] ?? null, $source);
        }

        $out['price'] = $this->boundPrice($out['price'], $out['contract']['value'], $out['rent_period']['value']);
        // Une vente n'a pas de période de loyer, même si le texte du prix en porte une. Les drapeaux
        // déjà posés (une valeur invalide du modèle) restent : la période déduite ne les efface pas.
        if ($out['rent_period']['value'] === null && $out['price']['period'] !== null && $out['contract']['value'] !== 'sale') {
            $flags = $out['rent_period']['flags'];
            $out['rent_period'] = [
                'value' => $out['price']['period'],
                'confidence' => $flags === [] ? $out['price']['confidence'] : RadarConfidence::lowest()->value,
                'evidence' => $out['price']['evidence'],
                'flags' => $flags,
            ];
        }

        $out['neighborhood'] += $out['neighborhood']['value'] === null
            ? ['neighborhood_id' => null, 'suggestions' => []]
            : $this->matcher->match($out['neighborhood']['value'], $out['city']['value']);

        [$out['phones'], $out['phones_flags'], $out['phones_dropped']] = $this->phones($raw['phones'] ?? null, $source === null ? null : (string) $sourceText);
        $out['nature_signals'] = $this->natureSignals($raw['nature_signals'] ?? null);

        return $out;
    }

    /**
     * @param  array{folded: string, bare: string}|null  $source
     * @return array{value: mixed, confidence: string, evidence: ?string, flags: list<string>}
     */
    private function field(string $field, mixed $entry, ?array $source): array
    {
        $entry = is_array($entry) ? $entry : [];
        $rawValue = $entry['value'] ?? null;
        $evidence = is_string($entry['evidence'] ?? null) && self::segments($entry['evidence']) !== [] ? trim($entry['evidence']) : null;
        $confidence = RadarConfidence::tryFrom(is_string($entry['confidence'] ?? null) ? $entry['confidence'] : '') ?? RadarConfidence::lowest();

        [$value, $flags, $extra] = $this->value($field, $rawValue);

        $present = $rawValue !== null && $rawValue !== '' && $rawValue !== []
            && ! ($field === 'advertiser_nature' && $rawValue === RadarAdvertiserNature::Unknown->value);
        if ($present && $evidence === null) {
            array_unshift($flags, self::FLAG_EVIDENCE_MISSING);
        } elseif ($present && $source !== null && ! self::inSource((string) $evidence, $source)) {
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
        // Un nombre rendu tel quel est déjà un montant en XOF (aucun multiplicateur à lire) : arrondi.
        if (is_int($value) || is_float($value)) {
            $amount = is_float($value) && is_finite($value) && abs($value) < 1e15 ? (int) round($value) : $value;

            return is_int($amount) && $amount > 0
                ? [$amount, [], ['raw' => (string) $value, 'period' => null]]
                : [null, [self::FLAG_INVALID_VALUE], ['raw' => (string) $value, 'period' => null]];
        }

        $raw = is_string($value) && trim($value) !== '' ? trim($value) : null;
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

    /**
     * Les numéros rendus, en E.164. Avec un texte source, seuls restent ceux que ce texte porte
     * ({@see RadarPhone::contactsFromText()} : mêmes neuf chiffres, quelle que soit l'écriture) ; un numéro
     * absent tombe de `phones` et pose `evidence_not_in_source` sur les numéros — c'est lui qui
     * désignerait la personne à contacter. Il n'est pas perdu pour autant : il est rendu à part
     * (TCK-2387, décision 1), en clair, pour que l'opérateur le voie ; jamais l'annonceur d'office.
     * Sans texte source (captures), rien n'est confronté : rien n'est écarté.
     *
     * @return array{0: list<string>, 1: list<string>, 2: list<string>} retenus, drapeaux, écartés
     */
    private function phones(mixed $phones, ?string $sourceText): array
    {
        if (! is_array($phones)) {
            return [[], [], []];
        }
        // TCK-2412 : la source doit le porter comme un contact, pas comme une liste ou une mesure que le masqueur lit.
        $inSource = $sourceText === null ? null : array_flip(RadarPhone::contactsFromText($sourceText));
        $out = [];
        $dropped = [];
        $flags = [];
        foreach ($phones as $phone) {
            $e164 = is_string($phone) ? RadarPhone::canonical($phone) : null;
            if ($e164 === null) {
                continue;
            }
            if ($inSource !== null && ! isset($inSource[$e164])) {
                $flags = [self::FLAG_EVIDENCE_NOT_IN_SOURCE];
                // TCK-2387 (décision 1) — gardé à part, affiché à l'opérateur, jamais l'annonceur d'office.
                $dropped[$e164] = true;

                continue;
            }
            $out[$e164] = true;
        }

        return [array_keys($out), $flags, array_keys($dropped)];
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

    /**
     * Le passage cité se trouve-t-il dans la source ? Un passage tronqué (« … », « ... ») se coupe
     * en segments, qui doivent s'y trouver dans l'ordre. Repli de la typographie d'abord
     * ({@see self::fold()}) ; à défaut, les deux côtés sans accents — le modèle en perd parfois.
     *
     * @param  array{folded: string, bare: string}  $source
     */
    private static function inSource(string $evidence, array $source): bool
    {
        $segments = array_map(self::fold(...), self::segments($evidence));

        return self::inOrder($segments, $source['folded'])
            || self::inOrder(array_map(self::withoutAccents(...), $segments), $source['bare']);
    }

    /** @return list<string> les segments non vides d'un passage, coupé à ses points de suspension */
    private static function segments(string $evidence): array
    {
        $parts = preg_split('/…|\.{3,}/u', $evidence) ?: [$evidence];

        return array_values(array_filter(array_map('trim', $parts), static fn (string $p): bool => $p !== ''));
    }

    /** @param  list<string>  $segments */
    private static function inOrder(array $segments, string $haystack): bool
    {
        $offset = 0;
        foreach ($segments as $segment) {
            $at = $segment === '' ? false : mb_strpos($haystack, $segment, $offset);
            if ($at === false) {
                return false;
            }
            $offset = $at + mb_strlen($segment);
        }

        return $segments !== [];
    }

    /**
     * Le repli sous lequel un passage cité se cherche dans le texte source : forme NFC, chiffres
     * ASCII, invisibles retirés, apostrophes en `'`, tirets en `-`, guillemets retirés (« » “ ” "),
     * blancs fusionnés, minuscules, blanc retiré avant « : ; ! ? », séparateurs de milliers (blanc,
     * point) retirés entre les groupes de chiffres.
     */
    private static function fold(string $text): string
    {
        $nfc = \Normalizer::normalize($text, \Normalizer::FORM_C);
        $text = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $nfc === false ? $text : $nfc));
        $text = strtr($text, ['’' => "'", 'ʼ' => "'", '‘' => "'", '`' => "'", '´' => "'"]);
        $text = (string) preg_replace('/[«»“”„‟"]/u', ' ', $text);
        $text = (string) preg_replace('/[‐‑‒–—―−]/u', '-', $text);

        $text = trim((string) preg_replace('/[\s\x{00A0}\x{202F}\x{2009}]+/u', ' ', mb_strtolower($text)));
        // « Prix: » comme « Prix : » ; « 1.500.000 » comme « 1 500 000 » comme « 1500000 ».
        $text = (string) preg_replace('/ ([:;!?])/u', '$1', $text);

        return (string) preg_replace('/(?<=\d)[ .](?=\d{3}(?!\d))/u', '', $text);
    }

    private static function withoutAccents(string $folded): string
    {
        $nfd = \Normalizer::normalize($folded, \Normalizer::FORM_D);

        return (string) preg_replace('/\p{Mn}+/u', '', $nfd === false ? $folded : $nfd);
    }
}
