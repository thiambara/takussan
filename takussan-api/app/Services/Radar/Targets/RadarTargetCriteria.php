<?php

namespace App\Services\Radar\Targets;

use App\Models\Enums\PropertyType;
use App\Models\Enums\RadarSourceSite;
use App\Services\Geo\GeoNeighborhoodResolver;

/**
 * TCK-2468 (ADR-0087 §5) — les critères d'une cible : leur validation, leur forme normalisée et leur empreinte. UN seul
 * point les juge, qu'ils viennent de la console ou de la révision de la demande par l'IA (TCK-2470).
 *
 * Forme normalisée (toutes les clés présentes ; liste vide ou null = sans contrainte) :
 *
 *     cities: list<string>                         noms de ville, espaces repliés, dédoublonnés à la casse près
 *     neighborhoods: list<{name: string, city: ?string}>
 *     types: list<string>                          valeurs de `PropertyType`, triées
 *     contract: 'rent'|'sale'|null
 *     price_min, price_max: ?int                   XOF, ≥ 0, min ≤ max
 *     bedrooms_min, bedrooms_max: ?int             0 à `radar.bounds.bedrooms.max`, min ≤ max
 *     furnished: ?bool
 *     sites: list<string>                          valeurs de `RadarSourceSite`, triées
 *     max_age_days: ?int                           1 à `radar.targets.max_age_days`
 *
 * Refus (`InvalidRadarTargetCriteria`, codes `radar.targets.*`) : `invalid_criteria` (forme ou valeur, `params.field`),
 * `unknown_criterion` (clé inconnue), `too_many_items` (liste trop longue, `params.max`), `invalid_range` (min > max),
 * `empty_criteria` (aucune contrainte). Les noms de lieu se comparent par la clé du référentiel
 * ({@see GeoNeighborhoodResolver::cle()} : casse repliée par `CaseInsensitive`, blancs, tirets et apostrophes) — c'est
 * aussi cette clé qui entre dans l'empreinte : « Almadies » et « ALMADIES » sont la même cible.
 */
final class RadarTargetCriteria
{
    public const KEYS = [
        'cities', 'neighborhoods', 'types', 'contract', 'price_min', 'price_max', 'bedrooms_min', 'bedrooms_max',
        'furnished', 'sites', 'max_age_days',
    ];

    public const CONTRACTS = ['rent', 'sale'];

    /**
     * @return array<string, mixed> la forme normalisée
     *
     * @throws InvalidRadarTargetCriteria
     */
    public static function normalize(mixed $input): array
    {
        if (! is_array($input) || ($input !== [] && array_is_list($input))) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria']);
        }
        foreach (array_keys($input) as $key) {
            if (! in_array($key, self::KEYS, true)) {
                throw new InvalidRadarTargetCriteria('radar.targets.unknown_criterion', ['field' => 'criteria.'.$key]);
            }
        }

        $out = [
            'cities' => self::places($input['cities'] ?? null, 'cities'),
            'neighborhoods' => self::neighborhoods($input['neighborhoods'] ?? null),
            'types' => self::enumList($input['types'] ?? null, 'types', array_column(PropertyType::cases(), 'value')),
            'contract' => self::contract($input['contract'] ?? null),
            'price_min' => self::integer($input['price_min'] ?? null, 'price_min', 0, PHP_INT_MAX),
            'price_max' => self::integer($input['price_max'] ?? null, 'price_max', 0, PHP_INT_MAX),
            'bedrooms_min' => self::integer($input['bedrooms_min'] ?? null, 'bedrooms_min', 0, self::maxBedrooms()),
            'bedrooms_max' => self::integer($input['bedrooms_max'] ?? null, 'bedrooms_max', 0, self::maxBedrooms()),
            'furnished' => self::boolean($input['furnished'] ?? null),
            'sites' => self::enumList($input['sites'] ?? null, 'sites', array_column(RadarSourceSite::cases(), 'value')),
            'max_age_days' => self::integer($input['max_age_days'] ?? null, 'max_age_days', 1, (int) config('radar.targets.max_age_days', 365)),
        ];

        foreach (['price', 'bedrooms'] as $range) {
            if ($out[$range.'_min'] !== null && $out[$range.'_max'] !== null && $out[$range.'_min'] > $out[$range.'_max']) {
                throw new InvalidRadarTargetCriteria('radar.targets.invalid_range', ['field' => 'criteria.'.$range.'_min']);
            }
        }
        if (self::isEmpty($out)) {
            throw new InvalidRadarTargetCriteria('radar.targets.empty_criteria');
        }

        return $out;
    }

    /**
     * Des critères stockés, dans l'ordre de {@see self::KEYS} (`jsonb` ne garde pas l'ordre des clés), chaque clé absente
     * rendue sans contrainte : la forme que la console lit.
     *
     * @param  array<string, mixed>  $criteria
     * @return array<string, mixed>
     */
    public static function ordered(array $criteria): array
    {
        $out = [];
        foreach (self::KEYS as $key) {
            $out[$key] = $criteria[$key] ?? (in_array($key, ['cities', 'neighborhoods', 'types', 'sites'], true) ? [] : null);
        }

        return $out;
    }

    /** @param  array<string, mixed>  $criteria  forme normalisée */
    public static function isEmpty(array $criteria): bool
    {
        foreach (self::KEYS as $key) {
            $value = $criteria[$key] ?? null;
            if ($value !== null && $value !== []) {
                return false;
            }
        }

        return true;
    }

    /**
     * L'empreinte de critères NORMALISÉS : SHA-256 de leur forme repliée (lieux par la clé du référentiel, listes triées).
     *
     * @param  array<string, mixed>  $criteria
     */
    public static function signature(array $criteria): string
    {
        $cities = array_map(GeoNeighborhoodResolver::cle(...), $criteria['cities'] ?? []);
        sort($cities);
        $neighborhoods = array_map(
            static fn (array $n): string => GeoNeighborhoodResolver::cle($n['name']).'|'.GeoNeighborhoodResolver::cle((string) ($n['city'] ?? '')),
            $criteria['neighborhoods'] ?? [],
        );
        sort($neighborhoods);
        $folded = ['cities' => $cities, 'neighborhoods' => $neighborhoods];
        foreach (self::KEYS as $key) {
            if (! isset($folded[$key])) {
                $value = $criteria[$key] ?? null;
                if (is_array($value)) {
                    sort($value);
                }
                $folded[$key] = $value;
            }
        }
        ksort($folded);

        return hash('sha256', json_encode($folded, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    private static function maxBedrooms(): int
    {
        return (int) config('radar.bounds.bedrooms.max', 30);
    }

    private static function maxItems(): int
    {
        return (int) config('radar.targets.max_list_items', 30);
    }

    /** @return list<mixed> */
    private static function list(mixed $value, string $field): array
    {
        if ($value === null) {
            return [];
        }
        if (! is_array($value) || ! array_is_list($value)) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria.'.$field]);
        }
        if (count($value) > self::maxItems()) {
            throw new InvalidRadarTargetCriteria('radar.targets.too_many_items', ['field' => 'criteria.'.$field, 'max' => self::maxItems()]);
        }

        return $value;
    }

    /** Un nom de lieu, espaces repliés ; null s'il est vide. */
    private static function place(mixed $value, string $field): ?string
    {
        if ($value === null) {
            return null;
        }
        if (! is_string($value)) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria.'.$field]);
        }
        $name = trim((string) preg_replace('/\s+/u', ' ', $value));
        if (mb_strlen($name) > (int) config('radar.targets.max_place_length', 80)) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria.'.$field]);
        }

        return $name === '' || GeoNeighborhoodResolver::cle($name) === '' ? null : $name;
    }

    /** @return list<string> */
    private static function places(mixed $value, string $field): array
    {
        $out = [];
        foreach (self::list($value, $field) as $i => $item) {
            $name = self::place($item, "{$field}.{$i}");
            if ($name === null) {
                throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => "criteria.{$field}.{$i}"]);
            }
            $out[GeoNeighborhoodResolver::cle($name)] ??= $name;
        }

        return array_values($out);
    }

    /** @return list<array{name: string, city: ?string}> */
    private static function neighborhoods(mixed $value): array
    {
        $out = [];
        foreach (self::list($value, 'neighborhoods') as $i => $item) {
            if (! is_array($item) || array_diff(array_keys($item), ['name', 'city']) !== []) {
                throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => "criteria.neighborhoods.{$i}"]);
            }
            $name = self::place($item['name'] ?? null, "neighborhoods.{$i}.name");
            if ($name === null) {
                throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => "criteria.neighborhoods.{$i}.name"]);
            }
            $city = self::place($item['city'] ?? null, "neighborhoods.{$i}.city");
            $key = GeoNeighborhoodResolver::cle($name).'|'.GeoNeighborhoodResolver::cle((string) $city);
            $out[$key] ??= ['name' => $name, 'city' => $city];
        }

        return array_values($out);
    }

    /**
     * @param  list<string>  $allowed
     * @return list<string>
     */
    private static function enumList(mixed $value, string $field, array $allowed): array
    {
        $out = [];
        foreach (self::list($value, $field) as $i => $item) {
            if (! is_string($item) || ! in_array($item, $allowed, true)) {
                throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => "criteria.{$field}.{$i}"]);
            }
            $out[$item] = true;
        }
        $out = array_keys($out);
        sort($out);

        return $out;
    }

    private static function contract(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (! is_string($value) || ! in_array($value, self::CONTRACTS, true)) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria.contract']);
        }

        return $value;
    }

    /** Un entier dans `[min, max]` : un entier JSON, ou une chaîne de chiffres (champ de formulaire). */
    private static function integer(mixed $value, string $field, int $min, int $max): ?int
    {
        if ($value === null) {
            return null;
        }
        $int = match (true) {
            is_int($value) => $value,
            is_string($value) && preg_match('/^\d{1,18}$/', $value) === 1 => (int) $value,
            default => null,
        };
        if ($int === null || $int < $min || $int > $max) {
            throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria.'.$field]);
        }

        return $int;
    }

    private static function boolean(mixed $value): ?bool
    {
        if ($value === null || is_bool($value)) {
            return $value;
        }

        throw new InvalidRadarTargetCriteria('radar.targets.invalid_criteria', ['field' => 'criteria.furnished']);
    }
}
