<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\HierarchyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-086 — invariant tests for re-parenting (PATCH /api/properties/{id}).
 */
class PropertyHierarchyTest extends TestCase
{
    use RefreshDatabase;

    public function test_attaches_property_under_parent(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($owner);

        $building = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $owner->id]);
        $floor = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $owner->id]);

        $this->patchJson("/api/properties/{$floor->id}", ['parent_id' => $building->id])
            ->assertOk()
            ->assertJsonPath('data.id', $floor->id);

        $this->assertSame($building->id, $floor->refresh()->parent_id);
    }

    public function test_rejects_self_as_parent(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $node = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);

        $this->patchJson("/api/properties/{$node->id}", ['parent_id' => $node->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['parent_id']);
    }

    public function test_rejects_descendant_as_parent_cycle(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $a = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $b = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $a->id]);
        $c = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $b->id]);

        // attaching A under C would create cycle (A → B → C → A)
        $this->patchJson("/api/properties/{$a->id}", ['parent_id' => $c->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['parent_id']);
    }

    public function test_rejects_max_depth_exceeded(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        // Build chain depth 4: lvl1 → lvl2 → lvl3 → lvl4
        $lvl1 = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $lvl2 = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $lvl1->id]);
        $lvl3 = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $lvl2->id]);
        $lvl4 = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $lvl3->id]);

        $orphan = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);

        // attaching orphan under lvl4 would yield depth 5
        $this->patchJson("/api/properties/{$orphan->id}", ['parent_id' => $lvl4->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['parent_id']);
    }

    public function test_rejects_cross_agency_parent(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agencyA->id]);
        Sanctum::actingAs($user);

        $child = Property::factory()->create(['agency_id' => $agencyA->id, 'user_id' => $user->id]);
        $foreign = Property::factory()->create(['agency_id' => $agencyB->id]);

        $this->patchJson("/api/properties/{$child->id}", ['parent_id' => $foreign->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['parent_id']);
    }

    public function test_detaching_to_root_is_allowed(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $building = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $floor = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $building->id]);

        $this->patchJson("/api/properties/{$floor->id}", ['parent_id' => null])
            ->assertOk();

        $this->assertNull($floor->refresh()->parent_id);
    }

    public function test_soft_deleting_parent_detaches_children(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);

        $parent = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $child = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $parent->id]);

        // Soft-delete (the standard delete() path on the Property model) must
        // null out children's parent_id without cascading the soft-delete.
        $parent->delete();

        $this->assertNull($child->refresh()->parent_id);
        $this->assertNull($child->deleted_at);
    }

    public function test_hierarchy_service_ancestors_returns_chain_closest_first(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);

        $root = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $mid = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $root->id]);
        $leaf = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $mid->id]);

        $svc = app(HierarchyService::class);
        $chain = $svc->ancestors($leaf->refresh()->load('parent.parent'))->pluck('id')->all();

        $this->assertSame([$mid->id, $root->id], $chain);
    }

    public function test_hierarchy_service_depth(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);

        $root = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $mid = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $root->id]);

        $svc = app(HierarchyService::class);
        $this->assertSame(1, $svc->depth($root->refresh()));
        $this->assertSame(2, $svc->depth($mid->refresh()->load('parent')));
    }
}
