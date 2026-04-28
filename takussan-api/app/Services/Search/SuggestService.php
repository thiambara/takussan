<?php

namespace App\Services\Search;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SuggestService
{
    public function __construct(
        private readonly CacheRepository $cache,
    ) {}

    /**
     * @return array{cities: list<array<string,mixed>>, neighborhoods: list<array<string,mixed>>, property_types: list<array<string,mixed>>}
     */
    public function resolve(string $q, int $limit, string $locale): array
    {
        $q = trim($q);

        if ($q === '') {
            return ['cities' => [], 'neighborhoods' => [], 'property_types' => []];
        }

        $base = $this->getBase($locale);
        $needle = $this->normalize($q);

        return [
            'cities' => $this->filterPrefix($base['cities'], $needle, $limit),
            'neighborhoods' => $this->filterPrefix($base['neighborhoods'], $needle, $limit),
            'property_types' => $this->filterPrefix($base['property_types'], $needle, $limit),
        ];
    }

    /**
     * @return array{cities: list<array<string,mixed>>, neighborhoods: list<array<string,mixed>>, property_types: list<array<string,mixed>>}
     */
    private function getBase(string $locale): array
    {
        return $this->cache->remember("search:suggest:base:{$locale}", 300, function () use ($locale): array {
            return [
                'cities' => $this->resolveCities(),
                'neighborhoods' => $this->resolveNeighborhoods(),
                'property_types' => $this->resolveTypes($locale),
            ];
        });
    }

    /** @return list<array<string,mixed>> */
    private function resolveCities(): array
    {
        return Address::query()
            ->whereHasMorph('addressable', Property::class, fn ($q) => $q->public())
            ->whereNotNull('city')
            ->groupBy('city')
            ->select('city as label', DB::raw('count(*) as count'))
            ->orderByDesc('count')
            ->orderBy('city')
            ->limit(500)
            ->get()
            ->map(fn ($row) => [
                'label' => $row->label,
                'slug' => Str::slug($row->label),
                'count' => (int) $row->count,
                'normalized_label' => $this->normalize($row->label),
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string,mixed>> */
    private function resolveNeighborhoods(): array
    {
        return Address::query()
            ->whereHasMorph('addressable', Property::class, fn ($q) => $q->public())
            ->whereNotNull('neighborhood')
            ->groupBy(['neighborhood', 'city'])
            ->select(
                'neighborhood as label',
                'city',
                DB::raw('count(*) as count')
            )
            ->orderByDesc('count')
            ->orderBy('neighborhood')
            ->limit(500)
            ->get()
            ->map(fn ($row) => [
                'label' => $row->label,
                'city' => $row->city,
                'slug' => Str::slug($row->label),
                'count' => (int) $row->count,
                'normalized_label' => $this->normalize($row->label),
            ])
            ->values()
            ->all();
    }

    /** @return list<array<string,mixed>> */
    private function resolveTypes(string $locale): array
    {
        $counts = Property::query()
            ->public()
            ->groupBy('type')
            ->select('type', DB::raw('count(*) as count'))
            ->get()
            ->keyBy('type');

        return collect(PropertyType::cases())
            ->map(function (PropertyType $type) use ($counts, $locale): array {
                $count = isset($counts[$type->value]) ? (int) $counts[$type->value]->count : 0;
                $label = (string) trans("properties.type.{$type->value}", [], $locale);

                return [
                    'label' => $label,
                    'value' => $type->value,
                    'count' => $count,
                    'normalized_label' => $this->normalize($label),
                ];
            })
            ->filter(fn ($row) => $row['count'] > 0)
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function normalize(string $s): string
    {
        return Str::ascii(Str::lower(trim($s)));
    }

    /**
     * @param  list<array<string,mixed>>  $rows
     * @return list<array<string,mixed>>
     */
    private function filterPrefix(array $rows, string $needle, int $limit): array
    {
        $results = [];
        foreach ($rows as $row) {
            if (str_starts_with((string) $row['normalized_label'], $needle)) {
                $clean = $row;
                unset($clean['normalized_label']);
                $results[] = $clean;
            }
            if (count($results) >= $limit) {
                break;
            }
        }

        return $results;
    }
}
