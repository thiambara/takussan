<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Services\Property\HomepageDiscoveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-247 — single discovery endpoint feeding the four homepage rows.
 */
class HomepageDiscoveryTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/public/properties/discovery';

    /**
     * `PropertyFactory` creates NO address and randomises `contract_type`:
     * both must be forced explicitly or the row-level assertions below become
     * coin flips.
     */
    private function makeProperty(string $city, array $attributes = [], int $minutesAgo = 0): Property
    {
        $property = Property::factory()->published()->create($attributes + [
            'published_at' => now()->subMinutes($minutesAgo),
        ]);

        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $city,
        ]);

        return $property->refresh();
    }

    // ── Structure ────────────────────────────────────────────────────────────

    public function test_returns_the_four_rows_in_a_single_payload(): void
    {
        $this->makeProperty('Dakar', ['contract_type' => ContractType::Rent]);

        $response = $this->getJson(self::URL);

        $response->assertOk()->assertJsonStructure([
            'data' => [
                'near' => ['items', 'city', 'requested_city', 'fallback'],
                'rent' => ['items'],
                'featured' => ['items'],
                'latest' => ['items'],
            ],
            'meta' => ['per_row'],
        ]);
    }

    public function test_items_carry_the_public_property_list_shape(): void
    {
        $this->makeProperty('Dakar');

        // Asserted on `near`, the first row served by the dedup pass: with a
        // single property in the catalogue, the rows below it are legitimately
        // empty because `near` has already claimed it.
        $this->getJson(self::URL)
            ->assertOk()
            ->assertJsonStructure([
                'data' => ['near' => ['items' => [[
                    'id', 'title', 'slug', 'price', 'type', 'location', 'featured',
                ]]]],
            ])
            // Light (list) shape, not the detail one: the discovery route is not
            // among the routes PropertyResource treats as `$isDetail`.
            ->assertJsonMissingPath('data.near.items.0.description');
    }

    // ── Dedup ────────────────────────────────────────────────────────────────

    public function test_a_property_never_appears_twice_across_near_rent_and_latest(): void
    {
        foreach (range(1, 8) as $i) {
            $this->makeProperty('Dakar', ['contract_type' => ContractType::Rent], $i);
        }

        $data = $this->getJson(self::URL)->assertOk()->json('data');

        $ids = array_merge(
            array_column($data['near']['items'], 'id'),
            array_column($data['rent']['items'], 'id'),
            array_column($data['latest']['items'], 'id'),
        );

        $this->assertSame(array_unique($ids), $ids, 'near ∪ rent ∪ latest must hold each id once.');
    }

    public function test_featured_is_exempt_from_dedup_and_may_overlap(): void
    {
        $star = $this->makeProperty('Dakar', [
            'contract_type' => ContractType::Rent,
            'featured' => true,
        ]);
        foreach (range(1, 5) as $i) {
            $this->makeProperty('Dakar', ['contract_type' => ContractType::Rent], $i);
        }

        $data = $this->getJson(self::URL)->assertOk()->json('data');

        $this->assertContains($star->id, array_column($data['featured']['items'], 'id'));

        $others = array_merge(
            array_column($data['near']['items'], 'id'),
            array_column($data['rent']['items'], 'id'),
            array_column($data['latest']['items'], 'id'),
        );
        $this->assertContains($star->id, $others, 'A curated pick must still surface in a generic row.');
    }

    // ── Fill rate ────────────────────────────────────────────────────────────

    public function test_a_row_refills_from_a_wider_pool_instead_of_shrinking(): void
    {
        // The four freshest rentals are in Dakar, so they take the whole `near`
        // row AND head the `rent` candidate list. Client-side dedup subtracted
        // them and left `rent` at 2; the server pool must refill it to 4.
        foreach (range(1, 4) as $i) {
            $this->makeProperty('Dakar', ['contract_type' => ContractType::Rent], $i);
        }
        foreach (range(5, 10) as $i) {
            $this->makeProperty('Thiès', ['contract_type' => ContractType::Rent], $i);
        }

        $data = $this->getJson(self::URL.'?per_row=4')->assertOk()->json('data');

        $near = array_column($data['near']['items'], 'id');
        $rent = array_column($data['rent']['items'], 'id');

        $this->assertCount(4, $near);
        $this->assertCount(4, $rent);
        $this->assertSame([], array_intersect($near, $rent));
    }

    public function test_per_row_caps_every_row(): void
    {
        foreach (range(1, 9) as $i) {
            $this->makeProperty('Dakar', ['contract_type' => ContractType::Rent, 'featured' => true], $i);
        }

        $data = $this->getJson(self::URL.'?per_row=3')->assertOk()->json('data');

        foreach (['near', 'rent', 'featured', 'latest'] as $row) {
            $this->assertLessThanOrEqual(3, count($data[$row]['items']), "row {$row}");
        }
        $this->assertSame(3, $this->getJson(self::URL.'?per_row=3')->json('meta.per_row'));
    }

    public function test_per_row_is_capped_at_twenty(): void
    {
        $this->getJson(self::URL.'?per_row=21')->assertStatus(422);
        $this->getJson(self::URL.'?per_row=20')->assertOk();
    }

    // ── « Près de toi » : ville devinée, seuil et repli ───────────────────────

    public function test_near_falls_back_to_dakar_when_no_city_is_given(): void
    {
        foreach (range(1, 5) as $i) {
            $this->makeProperty('Dakar', [], $i);
        }

        $near = $this->getJson(self::URL)->assertOk()->json('data.near');

        $this->assertSame('Dakar', $near['city']);
        $this->assertNull($near['requested_city']);
        $this->assertFalse($near['fallback'], 'Not knowing the city is the nominal default, not a fallback.');
        $this->assertCount(5, $near['items']);
    }

    public function test_near_keeps_the_visitor_city_when_it_holds_enough_listings(): void
    {
        foreach (range(1, HomepageDiscoveryService::NEAR_ROW_MIN_ITEMS) as $i) {
            $this->makeProperty('Ziguinchor', [], $i);
        }
        foreach (range(1, 8) as $i) {
            $this->makeProperty('Dakar', [], $i);
        }

        $near = $this->getJson(self::URL.'?near_city=Ziguinchor')->assertOk()->json('data.near');

        $this->assertSame('Ziguinchor', $near['city']);
        $this->assertSame('Ziguinchor', $near['requested_city']);
        $this->assertFalse($near['fallback']);
        $this->assertCount(HomepageDiscoveryService::NEAR_ROW_MIN_ITEMS, $near['items']);
    }

    public function test_near_switches_entirely_to_dakar_when_the_visitor_city_is_too_thin(): void
    {
        foreach (range(1, HomepageDiscoveryService::NEAR_ROW_MIN_ITEMS - 1) as $i) {
            $this->makeProperty('Ziguinchor', [], $i);
        }
        foreach (range(1, 8) as $i) {
            $this->makeProperty('Dakar', [], $i + 100);
        }

        $near = $this->getJson(self::URL.'?near_city=Ziguinchor')->assertOk()->json('data.near');

        $this->assertTrue($near['fallback']);
        $this->assertSame('Dakar', $near['city']);
        $this->assertSame('Ziguinchor', $near['requested_city']);
        $this->assertCount(HomepageDiscoveryService::DEFAULT_PER_ROW > 8 ? 8 : HomepageDiscoveryService::DEFAULT_PER_ROW, $near['items']);

        // The row is full of Dakar and *only* Dakar — no silent blending.
        foreach ($near['items'] as $item) {
            $this->assertSame('Dakar', $item['location']['city']);
        }
    }

    public function test_a_city_unknown_to_the_catalogue_is_the_nominal_fallback_case_not_an_error(): void
    {
        foreach (range(1, 6) as $i) {
            $this->makeProperty('Dakar', [], $i);
        }

        $near = $this->getJson(self::URL.'?near_city=Reykjavik')->assertOk()->json('data.near');

        $this->assertTrue($near['fallback']);
        $this->assertSame('Dakar', $near['city']);
        $this->assertSame('Reykjavik', $near['requested_city']);
        $this->assertCount(6, $near['items']);
    }

    public function test_city_matching_ignores_case(): void
    {
        foreach (range(1, 6) as $i) {
            $this->makeProperty('Ziguinchor', [], $i);
        }

        $near = $this->getJson(self::URL.'?near_city=ZIGUINCHOR')->assertOk()->json('data.near');

        $this->assertFalse($near['fallback']);
        // The label echoed back is the catalogue's spelling, not the visitor's:
        // the frontend renders it in the row title.
        $this->assertSame('Ziguinchor', $near['city']);
        $this->assertCount(6, $near['items']);
    }

    // ── Visibilité ───────────────────────────────────────────────────────────

    public function test_drafts_and_non_public_properties_are_excluded(): void
    {
        $visible = $this->makeProperty('Dakar');

        $draft = Property::factory()->draft()->create();
        Address::factory()->create([
            'addressable_id' => $draft->id,
            'addressable_type' => Property::class,
            'city' => 'Dakar',
        ]);

        $data = $this->getJson(self::URL)->assertOk()->json('data');

        $everywhere = [];
        foreach (['near', 'rent', 'featured', 'latest'] as $row) {
            $ids = array_column($data[$row]['items'], 'id');
            $this->assertNotContains($draft->id, $ids, "row {$row}");
            $everywhere = array_merge($everywhere, $ids);
        }
        $this->assertContains($visible->id, $everywhere);
    }

    // ── Contrat de cache ─────────────────────────────────────────────────────

    public function test_response_is_publicly_cacheable(): void
    {
        $headers = $this->getJson(self::URL)->assertOk()->headers;

        // Asserted directive by directive rather than on the whole string:
        // Symfony re-serialises Cache-Control alphabetically, so pinning the
        // literal would test its formatter, not our contract.
        $this->assertTrue($headers->hasCacheControlDirective('public'));
        $this->assertSame('60', $headers->getCacheControlDirective('max-age'));
        $this->assertSame('300', $headers->getCacheControlDirective('s-maxage'));
        $this->assertFalse($headers->hasCacheControlDirective('private'));
        $this->assertFalse($headers->hasCacheControlDirective('no-store'));
    }
}
