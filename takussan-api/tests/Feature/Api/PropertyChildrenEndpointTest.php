<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyChildrenEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_only_direct_children(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        $child = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);
        // Grandchild (must NOT appear in /children).
        Property::factory()->create(['user_id' => $user->id, 'parent_id' => $child->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/properties/{$parent->id}/children")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $child->id);
    }

    public function test_supports_status_filter(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        Property::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $parent->id,
            'status' => PropertyStatus::Available,
        ]);
        Property::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $parent->id,
            'status' => PropertyStatus::Draft,
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/properties/{$parent->id}/children?filter[status]=available")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.status', 'available');
    }

    public function test_supports_pagination(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        Property::factory()->count(5)->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/properties/{$parent->id}/children?per_page=2")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 5)
            ->assertJsonPath('meta.per_page', 2);
    }

    public function test_403_when_parent_not_owned(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $other->id]);
        Property::factory()->count(2)->create(['user_id' => $other->id, 'parent_id' => $parent->id]);

        Sanctum::actingAs($me);

        $this->getJson("/api/properties/{$parent->id}/children")->assertForbidden();
    }
}
