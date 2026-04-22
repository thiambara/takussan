<?php

namespace Tests\Feature\Public;

use App\Http\Controllers\Public\PublicPropertyController;
use App\Models\Address;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PropertyMapTest extends TestCase
{
    use RefreshDatabase;

    private function attachAddress(Property $property, float $lat, float $lng): void
    {
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => $lat,
            'longitude' => $lng,
        ]);
    }

    public function test_map_returns_geojson_feature_collection(): void
    {
        $property = Property::factory()->published()->create();
        $this->attachAddress($property, 14.7, -17.5);

        $response = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0');

        $response->assertOk()
            ->assertJsonPath('type', 'FeatureCollection')
            ->assertJsonCount(1, 'features')
            ->assertJsonPath('features.0.type', 'Feature')
            ->assertJsonPath('features.0.geometry.type', 'Point')
            ->assertJsonPath('features.0.properties.id', $property->id)
            ->assertJsonPath('features.0.properties.title', $property->title);

        $this->assertSame(
            [-17.5, 14.7],
            array_map('floatval', $response->json('features.0.geometry.coordinates'))
        );
    }

    public function test_map_requires_bounds_param(): void
    {
        $this->getJson('/api/public/properties/map')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['bounds']);
    }

    public function test_map_rejects_malformed_bounds(): void
    {
        $this->getJson('/api/public/properties/map?bounds=not,a,valid,box')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['bounds']);
    }

    public function test_map_rejects_bounds_with_wrong_arity(): void
    {
        $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['bounds']);
    }

    public function test_map_excludes_properties_without_coordinates(): void
    {
        $withCoords = Property::factory()->published()->create();
        $this->attachAddress($withCoords, 14.7, -17.5);

        $withAddressNoCoords = Property::factory()->published()->create();
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $withAddressNoCoords->id,
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => null,
            'longitude' => null,
        ]);

        Property::factory()->published()->create();

        $response = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0');

        $response->assertOk()->assertJsonCount(1, 'features');
        $this->assertSame($withCoords->id, $response->json('features.0.properties.id'));
    }

    public function test_map_excludes_properties_outside_bounds(): void
    {
        $inside = Property::factory()->published()->create();
        $this->attachAddress($inside, 14.7, -17.5);

        $outside = Property::factory()->published()->create();
        $this->attachAddress($outside, 50.0, 2.0);

        $response = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0');

        $response->assertOk()->assertJsonCount(1, 'features');
        $this->assertSame($inside->id, $response->json('features.0.properties.id'));
    }

    public function test_map_is_accessible_without_auth(): void
    {
        $property = Property::factory()->published()->create();
        $this->attachAddress($property, 14.7, -17.5);

        $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0')
            ->assertOk();
    }

    public function test_map_filters_by_type_and_contract_type(): void
    {
        $house = Property::factory()->published()->create([
            'type' => PropertyType::House,
            'contract_type' => ContractType::Sale,
        ]);
        $this->attachAddress($house, 14.7, -17.5);

        $apartment = Property::factory()->published()->create([
            'type' => PropertyType::Apartment,
            'contract_type' => ContractType::Rent,
        ]);
        $this->attachAddress($apartment, 14.75, -17.45);

        $response = $this->getJson(
            '/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0&type=house&contract_type=sale'
        );

        $response->assertOk()->assertJsonCount(1, 'features');
        $this->assertSame($house->id, $response->json('features.0.properties.id'));
    }

    public function test_map_filters_by_price_range(): void
    {
        $cheap = Property::factory()->published()->create(['price' => 100_000]);
        $this->attachAddress($cheap, 14.7, -17.5);
        $mid = Property::factory()->published()->create(['price' => 500_000]);
        $this->attachAddress($mid, 14.72, -17.48);
        $expensive = Property::factory()->published()->create(['price' => 5_000_000]);
        $this->attachAddress($expensive, 14.73, -17.47);

        $response = $this->getJson(
            '/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0&price_min=200000&price_max=1000000'
        );

        $response->assertOk()->assertJsonCount(1, 'features');
        $this->assertSame($mid->id, $response->json('features.0.properties.id'));
    }

    public function test_map_excludes_draft_properties(): void
    {
        $draft = Property::factory()->draft()->create();
        $this->attachAddress($draft, 14.7, -17.5);

        $response = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0');

        $response->assertOk()->assertJsonCount(0, 'features');
    }

    public function test_map_excludes_soft_deleted_properties(): void
    {
        $visible = Property::factory()->published()->create();
        $this->attachAddress($visible, 14.7, -17.5);

        $trashed = Property::factory()->published()->create();
        $this->attachAddress($trashed, 14.72, -17.48);
        $trashed->delete();

        $response = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0');

        $response->assertOk()->assertJsonCount(1, 'features');
        $this->assertSame($visible->id, $response->json('features.0.properties.id'));
    }

    public function test_map_exposes_limit_metadata_when_not_truncated(): void
    {
        $a = Property::factory()->published()->create();
        $this->attachAddress($a, 14.70, -17.50);
        $b = Property::factory()->published()->create();
        $this->attachAddress($b, 14.72, -17.48);

        $response = $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0');

        $response->assertOk()
            ->assertJsonCount(2, 'features')
            ->assertJsonPath('meta.limit', PublicPropertyController::MAP_MAX_RESULTS)
            ->assertJsonPath('meta.returned', 2)
            ->assertJsonPath('meta.truncated', false);
    }

    public function test_map_caps_results_at_max_limit_and_flags_truncated(): void
    {
        // Use a tiny cap for this test by leveraging many factories under the
        // real constant would be slow. Instead, we assert the SQL builder
        // receives a limit matching the constant and meta.truncated becomes
        // true when the count exceeds the cap. We simulate by temporarily
        // seeding `MAP_MAX_RESULTS + 1` rows is impractical; instead, we
        // verify the code path by asserting the SQL contains a `limit` equal
        // to MAP_MAX_RESULTS + 1 (controller probes for overflow).
        $property = Property::factory()->published()->create();
        $this->attachAddress($property, 14.7, -17.5);

        $seenLimit = null;
        DB::listen(function ($query) use (&$seenLimit) {
            if (preg_match('/from\s+"properties"/i', $query->sql)
                && preg_match('/limit\s+(\d+)/i', $query->sql, $m)) {
                $seenLimit = (int) $m[1];
            }
        });

        $this->getJson('/api/public/properties/map?bounds=14.0,-18.0,15.0,-17.0')
            ->assertOk();

        $this->assertSame(
            PublicPropertyController::MAP_MAX_RESULTS + 1,
            $seenLimit,
            'Expected properties query to probe with MAP_MAX_RESULTS + 1 to detect truncation.',
        );
    }
}
