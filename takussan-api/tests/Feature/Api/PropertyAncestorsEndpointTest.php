<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-086 — `GET /api/properties/{property}/ancestors`.
 */
class PropertyAncestorsEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_chain_closest_first_then_root(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $root = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $mid = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $root->id]);
        $leaf = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $mid->id]);

        $response = $this->getJson("/api/properties/{$leaf->id}/ancestors")
            ->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertSame([$mid->id, $root->id], $ids);
    }

    public function test_returns_empty_array_for_root_property(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $root = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);

        $this->getJson("/api/properties/{$root->id}/ancestors")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_returns_empty_array_for_isolated_property(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $isolated = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $user->id,
            'parent_id' => null,
        ]);

        $this->getJson("/api/properties/{$isolated->id}/ancestors")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_403_when_caller_is_outside_owner_or_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agencyA->id]);
        $stranger = User::factory()->create(['agency_id' => $agencyB->id]);

        $root = Property::factory()->create(['agency_id' => $agencyA->id, 'user_id' => $owner->id]);
        $leaf = Property::factory()->create(['agency_id' => $agencyA->id, 'user_id' => $owner->id, 'parent_id' => $root->id]);

        Sanctum::actingAs($stranger);

        $this->getJson("/api/properties/{$leaf->id}/ancestors")
            ->assertForbidden();
    }
}
