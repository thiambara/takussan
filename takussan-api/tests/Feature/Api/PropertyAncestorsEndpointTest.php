<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyAncestorsEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_chain_from_closest_to_farthest(): void
    {
        $user = User::factory()->create();
        $a = Property::factory()->create(['user_id' => $user->id]);
        $b = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $a->id]);
        $c = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $b->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson("/api/properties/{$c->id}/ancestors")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 2);

        $this->assertSame($b->id, $response->json('data.0.id'));
        $this->assertSame($a->id, $response->json('data.1.id'));
    }

    public function test_returns_empty_for_root_property(): void
    {
        $user = User::factory()->create();
        $root = Property::factory()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/properties/{$root->id}/ancestors")
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.total', 0);
    }

    public function test_403_when_property_not_accessible(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $other->id]);

        Sanctum::actingAs($me);

        $this->getJson("/api/properties/{$property->id}/ancestors")->assertForbidden();
    }
}
