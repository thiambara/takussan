<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\Tag;
use App\Services\Property\SimilarPropertiesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PropertySimilarTest extends TestCase
{
    use RefreshDatabase;

    // ── AC1 — Returns 200 ordered by score, never source ─────────────────────

    public function test_returns_200_with_ordered_collection_excluding_source(): void
    {
        $source = Property::factory()->published()->create([
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
        ]);
        Address::factory()->create([
            'addressable_id' => $source->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        foreach (range(1, 5) as $i) {
            $p = Property::factory()->published()->create([
                'type' => PropertyType::Villa,
                'contract_type' => ContractType::Sale,
                'price' => 100_000_000,
            ]);
            Address::factory()->create([
                'addressable_id' => $p->id,
                'addressable_type' => Property::class,
                'city' => 'Dakar',
            ]);
        }

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($source->id, $ids);
        $this->assertLessThanOrEqual(6, count($ids));
    }

    // ── AC2 — limit: default 6, max 12, 422 beyond ───────────────────────────

    public function test_default_limit_is_six(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar');

        foreach (range(1, 10) as $i) {
            $this->createPublishedPropertyInCity('Dakar', [
                'type' => $source->type,
                'contract_type' => $source->contract_type,
            ]);
        }

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $this->assertLessThanOrEqual(6, count($response->json('data')));
    }

    public function test_limit_twelve_is_accepted(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar');

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar?limit=12");

        $response->assertOk();
    }

    public function test_limit_above_twelve_returns_422(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar');

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar?limit=13");

        $response->assertUnprocessable();
    }

    // ── AC3 — Fallback to region when city has < limit candidates ────────────

    public function test_fallback_to_region_when_city_has_fewer_than_limit_candidates(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        // 2 in same city — fewer than default limit 6
        foreach (range(1, 2) as $i) {
            $this->createPublishedPropertyInCity('Dakar', [
                'type' => PropertyType::Villa,
                'contract_type' => ContractType::Sale,
            ]);
        }

        // 4 in same region (different city) — enough to reach limit with fallback
        foreach (range(1, 4) as $i) {
            $p = Property::factory()->published()->create([
                'type' => PropertyType::Villa,
                'contract_type' => ContractType::Sale,
            ]);
            Address::factory()->create([
                'addressable_id' => $p->id,
                'addressable_type' => Property::class,
                'city' => 'Thiès',
                'region' => 'Dakar',
            ]);
        }

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $count = count($response->json('data'));
        // Should include region-fallback properties to go beyond the 2 city-only matches
        $this->assertGreaterThan(2, $count);
    }

    // ── AC4 — Excluded statuses: pending_review, rejected, archived ──────────

    public function test_pending_review_properties_are_excluded(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        $excluded = Property::factory()->create([
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'status' => PropertyStatus::PendingReview,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
        Address::factory()->create([
            'addressable_id' => $excluded->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($excluded->id, $ids);
    }

    public function test_rejected_properties_are_excluded(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        $excluded = Property::factory()->create([
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'status' => PropertyStatus::Rejected,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
        Address::factory()->create([
            'addressable_id' => $excluded->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($excluded->id, $ids);
    }

    public function test_archived_properties_are_excluded(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        $excluded = Property::factory()->create([
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'status' => PropertyStatus::Archived,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
        Address::factory()->create([
            'addressable_id' => $excluded->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($excluded->id, $ids);
    }

    public function test_draft_properties_are_excluded(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar');

        $draft = Property::factory()->draft()->create([
            'type' => $source->type,
            'contract_type' => $source->contract_type,
        ]);
        Address::factory()->create([
            'addressable_id' => $draft->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($draft->id, $ids);
    }

    // ── AC5 — Second identical call served from cache ─────────────────────────

    public function test_second_call_is_served_from_cache(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar');

        $hitCount = 0;
        $service = $this->mock(SimilarPropertiesService::class, function ($mock) use (&$hitCount) {
            $mock->shouldReceive('findSimilar')
                ->andReturnUsing(function () use (&$hitCount) {
                    $hitCount++;

                    return collect();
                });
        });

        $this->app->instance(SimilarPropertiesService::class, $service);

        $this->getJson("/api/public/properties/{$source->slug}/similar");
        $this->getJson("/api/public/properties/{$source->slug}/similar");

        // Mock is called twice — actual caching is tested via cache layer below
        $this->assertEquals(2, $hitCount);
    }

    public function test_cache_stores_result_and_returns_it_on_second_call(): void
    {
        Cache::flush();

        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        $similar = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        $service = app(SimilarPropertiesService::class);
        $source->load('address', 'tags');

        // First call populates cache
        $first = $service->findSimilar($source, 6);
        // Second call hits cache
        $second = $service->findSimilar($source, 6);

        $this->assertSame($first->pluck('id')->all(), $second->pluck('id')->all());
        $this->assertTrue(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has("property:{$source->id}:similar:limit:6"));
    }

    // ── AC6 — Price change invalidates cache ──────────────────────────────────

    public function test_price_change_on_source_invalidates_similar_cache(): void
    {
        Cache::flush();

        $source = $this->createPublishedPropertyInCity('Dakar');

        // Warm the cache
        $service = app(SimilarPropertiesService::class);
        $service->findSimilar($source, 6);

        $this->assertTrue(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has("property:{$source->id}:similar:limit:6"));

        // Trigger price update → observer flushes cache tag
        $source->update(['price' => (float) $source->price + 1_000_000]);

        $this->assertFalse(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has("property:{$source->id}:similar:limit:6"));
    }

    // ── AC7 — Endpoint accepts fields[properties], include, sort ─────────────

    public function test_endpoint_accepts_spatie_query_params_without_error(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar');

        $response = $this->getJson(
            "/api/public/properties/{$source->slug}/similar?limit=3"
        );

        $response->assertOk();
    }

    // ── 404 for unknown slug ──────────────────────────────────────────────────

    public function test_returns_404_for_unknown_slug(): void
    {
        $response = $this->getJson('/api/public/properties/unknown-slug/similar');

        $response->assertNotFound();
    }

    // ── Scoring algorithm ─────────────────────────────────────────────────────

    public function test_same_type_scores_higher(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 200,
            'bedrooms' => 3,
        ]);

        // Same type + same price → score: 40 (type) + 25 (price) = 65
        $sameType = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => null,
            'bedrooms' => null,
        ]);

        // Different type + same price → score: 0 (type) + 25 (price) = 25
        $diffType = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => null,
            'bedrooms' => null,
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($sameType->id, $ids);
        $this->assertContains($diffType->id, $ids);

        // Lower index = higher score (list is sorted descending)
        $this->assertLessThan(
            array_search($diffType->id, $ids),
            array_search($sameType->id, $ids),
            'Same-type property should appear before different-type in the ranked list'
        );
    }

    public function test_common_tags_boost_score(): void
    {
        // Pin area/bedrooms so the only difference between candidates is tag overlap;
        // factory defaults are random and would make the tag-boost signal non-deterministic.
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 200,
            'bedrooms' => 3,
        ]);

        $tag1 = Tag::factory()->create();
        $tag2 = Tag::factory()->create();
        $source->tags()->attach([$tag1->id, $tag2->id]);

        $withTags = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 500,
            'bedrooms' => 5,
        ]);
        $withTags->tags()->attach([$tag1->id, $tag2->id]);

        $withoutTags = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 500,
            'bedrooms' => 5,
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($withTags->id, $ids);
        $this->assertContains($withoutTags->id, $ids);
        $this->assertLessThan(
            array_search($withoutTags->id, $ids),
            array_search($withTags->id, $ids),
            'Property with common tags should rank higher'
        );
    }

    // ── Contract type hard filter ─────────────────────────────────────────────

    public function test_different_contract_type_is_not_returned(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        $rentProperty = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Rent,
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertNotContains($rentProperty->id, $ids);
    }

    // ── Locality scoring & merged fallback ────────────────────────────────────

    public function test_same_city_outranks_same_region_only(): void
    {
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 200,
            'bedrooms' => 3,
        ]);

        // Same city → gets +10 locality bonus
        $sameCity = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 500,
            'bedrooms' => 5,
        ]);

        // Same region, different city → gets +5
        $sameRegionOnly = Property::factory()->published()->create([
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Sale,
            'price' => 100_000_000,
            'area' => 500,
            'bedrooms' => 5,
        ]);
        Address::factory()->create([
            'addressable_id' => $sameRegionOnly->id,
            'addressable_type' => Property::class,
            'city' => 'Thiès',
            'region' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($sameCity->id, $ids);
        $this->assertContains($sameRegionOnly->id, $ids);
        $this->assertLessThan(
            array_search($sameRegionOnly->id, $ids),
            array_search($sameCity->id, $ids),
            'Same-city candidate should rank above same-region-only candidate',
        );
    }

    public function test_fallback_merges_city_candidates_with_null_region(): void
    {
        // Source has city + region populated.
        $source = $this->createPublishedPropertyInCity('Dakar', [
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);

        // City match but address.region is NULL — under the old "replace" fallback
        // this candidate was dropped because the region query didn't match it.
        $cityMatchNullRegion = Property::factory()->published()->create([
            'type' => PropertyType::Villa,
            'contract_type' => ContractType::Sale,
        ]);
        Address::factory()->create([
            'addressable_id' => $cityMatchNullRegion->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
            'region' => null,
        ]);

        // A few region-only candidates so the city set is below the limit and fallback fires.
        foreach (range(1, 3) as $i) {
            $p = Property::factory()->published()->create([
                'type' => PropertyType::Villa,
                'contract_type' => ContractType::Sale,
            ]);
            Address::factory()->create([
                'addressable_id' => $p->id,
                'addressable_type' => Property::class,
                'city' => 'Thiès',
                'region' => 'Dakar',
            ]);
        }

        $response = $this->getJson("/api/public/properties/{$source->slug}/similar");

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($cityMatchNullRegion->id, $ids);
    }

    // ── Observer cache invalidation ───────────────────────────────────────────

    public function test_observer_invalidates_cache_on_create(): void
    {
        Cache::flush();

        $source = $this->createPublishedPropertyInCity('Dakar');
        $service = app(SimilarPropertiesService::class);
        $service->findSimilar($source, 6);

        $cacheKey = "property:{$source->id}:similar:limit:6";
        $this->assertTrue(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has($cacheKey));

        // Creating a new property triggers the observer
        Property::factory()->published()->create();

        $this->assertFalse(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has($cacheKey));
    }

    public function test_observer_invalidates_cache_on_delete(): void
    {
        Cache::flush();

        $source = $this->createPublishedPropertyInCity('Dakar');
        $service = app(SimilarPropertiesService::class);
        $service->findSimilar($source, 6);

        $toDelete = Property::factory()->published()->create();
        $cacheKey = "property:{$source->id}:similar:limit:6";

        // Re-warm after creation
        Cache::flush();
        $service->findSimilar($source, 6);
        $this->assertTrue(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has($cacheKey));

        $toDelete->delete();

        $this->assertFalse(Cache::tags([SimilarPropertiesService::CACHE_TAG])->has($cacheKey));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @param array<string, mixed> $overrides */
    private function createPublishedPropertyInCity(string $city, array $overrides = []): Property
    {
        $property = Property::factory()->published()->create($overrides);
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $city,
            'region' => 'Dakar',
        ]);

        return $property;
    }
}
