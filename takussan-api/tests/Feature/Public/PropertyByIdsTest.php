<?php

namespace Tests\Feature\Public;

use App\Http\Controllers\Public\PublicPropertyController;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-100 — public /by-ids endpoint smoke tests.
 *
 * Mirrors the compare endpoint contract. Powers the recently-viewed
 * carousel which needs a batch fetch by id with a higher cap than compare.
 */
class PropertyByIdsTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_requested_published_properties_in_order(): void
    {
        $a = Property::factory()->published()->create();
        $b = Property::factory()->published()->create();
        $c = Property::factory()->published()->create();

        $response = $this->getJson("/api/public/properties/by-ids?ids={$c->id},{$a->id},{$b->id}");

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

        $response = $this->getJson("/api/public/properties/by-ids?ids={$published->id},{$draft->id},99999");

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $published->id)
            ->assertJsonPath('meta.returned_ids', [$published->id]);
    }

    public function test_caps_at_max_ids(): void
    {
        $count = PublicPropertyController::BY_IDS_MAX_IDS + 2;
        $props = Property::factory()->count($count)->published()->create();
        $idsCsv = $props->pluck('id')->implode(',');

        $response = $this->getJson("/api/public/properties/by-ids?ids={$idsCsv}");

        $response->assertOk()->assertJsonCount(PublicPropertyController::BY_IDS_MAX_IDS, 'data');
    }

    public function test_ids_parameter_is_required(): void
    {
        $this->getJson('/api/public/properties/by-ids')->assertStatus(422);
    }

    public function test_no_auth_required(): void
    {
        $property = Property::factory()->published()->create();

        $this->getJson("/api/public/properties/by-ids?ids={$property->id}")->assertOk();
    }

    public function test_all_invalid_ids_return_empty_meta_with_both_keys(): void
    {
        $response = $this->getJson('/api/public/properties/by-ids?ids=0,-1,abc');

        $response->assertOk()
            ->assertJsonPath('meta.requested_ids', [])
            ->assertJsonPath('meta.returned_ids', []);
    }
}
