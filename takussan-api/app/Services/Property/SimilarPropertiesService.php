<?php

namespace App\Services\Property;

use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;

class SimilarPropertiesService
{
    public const CACHE_TAG = 'property-similar';

    private const CACHE_TTL = 3600;

    public function findSimilar(Property $source, int $limit): Collection
    {
        $cacheKey = "property:{$source->id}:similar:limit:{$limit}";

        return Cache::tags([self::CACHE_TAG])->remember($cacheKey, self::CACHE_TTL, function () use ($source, $limit) {
            return $this->compute($source, $limit);
        });
    }

    private function compute(Property $source, int $limit): Collection
    {
        $source->loadMissing('address', 'tags');

        $city = $source->address?->city;
        $region = $source->address?->region;

        $candidates = $this->fetchCandidates($source, $city, null);

        // Fallback: merge same-region candidates (instead of replacing), so city
        // matches with NULL/divergent region aren't dropped and locality scoring
        // can still rank same-city candidates above region-only ones.
        if ($candidates->count() < $limit && $region !== null) {
            $regionCandidates = $this->fetchCandidates($source, null, $region);
            $candidates = $candidates->concat($regionCandidates)->unique('id')->values();
        }

        return $this->rankByScore($source, $candidates)->take($limit);
    }

    /** @return Collection<int, Property> */
    private function fetchCandidates(Property $source, ?string $city, ?string $region): Collection
    {
        $query = Property::query()
            ->with(['address', 'tags'])
            ->public()
            ->where('id', '!=', $source->id)
            ->where('contract_type', $source->contract_type);

        if ($city !== null) {
            $query->whereHas('address', fn ($q) => $q->where('city', $city));
        } elseif ($region !== null) {
            $query->whereHas('address', fn ($q) => $q->where('region', $region));
        }

        return $query->get();
    }

    /** @return Collection<int, Property> */
    private function rankByScore(Property $source, Collection $candidates): Collection
    {
        $sourceTagIds = $source->tags->pluck('id')->all();
        $sourcePrice = (float) $source->price;
        $sourceCity = $source->address?->city;
        $sourceRegion = $source->address?->region;

        return $candidates
            ->sortByDesc(fn (Property $c) => $this->score($source, $c, $sourceTagIds, $sourcePrice, $sourceCity, $sourceRegion))
            ->values();
    }

    /** @param list<int> $sourceTagIds */
    private function score(
        Property $source,
        Property $candidate,
        array $sourceTagIds,
        float $sourcePrice,
        ?string $sourceCity,
        ?string $sourceRegion,
    ): int {
        $score = 0;

        // Locality: same city +10, same region (different city) +5.
        // Ensures city neighbours rank above region-only candidates after the
        // merged-fallback returns both sets.
        $candidateCity = $candidate->address?->city;
        $candidateRegion = $candidate->address?->region;
        if ($sourceCity !== null && $candidateCity === $sourceCity) {
            $score += 10;
        } elseif ($sourceRegion !== null && $candidateRegion === $sourceRegion) {
            $score += 5;
        }

        // Same property type: +40
        if ($candidate->type !== null && $candidate->type === $source->type) {
            $score += 40;
        }

        // Price proximity: ±20% → +25, ±35% → +15
        if ($sourcePrice > 0 && (float) $candidate->price > 0) {
            $diff = abs((float) $candidate->price - $sourcePrice) / $sourcePrice;
            if ($diff <= 0.20) {
                $score += 25;
            } elseif ($diff <= 0.35) {
                $score += 15;
            }
        }

        // Area proximity: ±20% → +15
        if ($source->area !== null && $source->area > 0
            && $candidate->area !== null && $candidate->area > 0) {
            $diff = abs($candidate->area - $source->area) / $source->area;
            if ($diff <= 0.20) {
                $score += 15;
            }
        }

        // Bedrooms: equal → +10, differ by 1 → +5
        if ($source->bedrooms !== null && $candidate->bedrooms !== null) {
            $diff = abs($candidate->bedrooms - $source->bedrooms);
            if ($diff === 0) {
                $score += 10;
            } elseif ($diff === 1) {
                $score += 5;
            }
        }

        // Common tags/amenities: +2 per match, capped at +10
        if (! empty($sourceTagIds)) {
            $commonCount = $candidate->tags->whereIn('id', $sourceTagIds)->count();
            $score += min($commonCount * 2, 10);
        }

        return $score;
    }

    public function invalidateForProperty(Property $property): void
    {
        Cache::tags([self::CACHE_TAG])->flush();
    }
}
