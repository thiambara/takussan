<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-082 — public /compare endpoint smoke tests.
 */
class PropertyCompareTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_requested_published_properties_in_order(): void
    {
        $a = Property::factory()->published()->create();
        $b = Property::factory()->published()->create();
        $c = Property::factory()->published()->create();

        $response = $this->getJson("/api/public/properties/compare?ids={$c->id},{$a->id},{$b->id}");

        $response->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.id', $c->id)
            ->assertJsonPath('data.1.id', $a->id)
            ->assertJsonPath('data.2.id', $b->id);
    }

    public function test_draft_and_unknown_ids_are_silently_dropped(): void
    {
        $published = Property::factory()->published()->create();
        $draft = Property::factory()->draft()->create();

        $response = $this->getJson("/api/public/properties/compare?ids={$published->id},{$draft->id},99999");

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $published->id)
            ->assertJsonPath('meta.returned_ids', [$published->id]);
    }

    public function test_caps_at_four_ids(): void
    {
        $props = Property::factory()->count(6)->published()->create();
        $idsCsv = $props->pluck('id')->implode(',');

        $response = $this->getJson("/api/public/properties/compare?ids={$idsCsv}");

        $response->assertOk()->assertJsonCount(4, 'data');
    }

    public function test_ids_parameter_is_required(): void
    {
        $this->getJson('/api/public/properties/compare')->assertStatus(422);
    }

    public function test_exposes_detail_fields_for_comparison(): void
    {
        $property = Property::factory()->published()->create([
            'bedrooms' => 3,
            'bathrooms' => 2,
            'area' => 120,
            'furnished' => true,
        ]);

        $response = $this->getJson("/api/public/properties/compare?ids={$property->id}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [[
                    'id', 'title', 'slug', 'price', 'currency',
                    'type', 'contract_type', 'rent_period',
                    'bedrooms', 'bathrooms', 'area', 'furnished',
                    'location' => ['city', 'quarter'],
                    'tags',
                ]],
            ]);
    }

    public function test_no_auth_required(): void
    {
        $property = Property::factory()->published()->create();

        $this->getJson("/api/public/properties/compare?ids={$property->id}")->assertOk();
    }

    /**
     * When every parsed id is invalid (zeros / negatives / non-numeric),
     * the controller short-circuits with an empty payload. It must still
     * include `returned_ids` in meta — the frontend's useCompare reducer
     * reads that field as an array and would crash on `undefined`.
     */
    public function test_all_invalid_ids_return_empty_meta_with_both_keys(): void
    {
        $response = $this->getJson('/api/public/properties/compare?ids=0,-1,abc');

        $response->assertOk()
            ->assertJsonPath('meta.requested_ids', [])
            ->assertJsonPath('meta.returned_ids', []);
    }
}
