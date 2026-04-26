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

        // Fallback: fewer candidates than requested → expand to same region
        if ($candidates->count() < $limit) {
            $candidates = $this->fetchCandidates($source, null, $region);
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

        return $candidates
            ->sortByDesc(fn (Property $c) => $this->score($source, $c, $sourceTagIds, $sourcePrice))
            ->values();
    }

    /** @param list<int> $sourceTagIds */
    private function score(Property $source, Property $candidate, array $sourceTagIds, float $sourcePrice): int
    {
        $score = 0;

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
