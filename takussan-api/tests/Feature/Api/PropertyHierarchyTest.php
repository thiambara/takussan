<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\HierarchyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PropertyHierarchyTest extends TestCase
{
    use RefreshDatabase;

    public function test_attaching_property_under_self_returns_422(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/properties/{$property->id}", [
            'parent_id' => $property->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['parent_id']);
    }

    public function test_attaching_creates_descendant_cycle_returns_422(): void
    {
        $user = User::factory()->create();
        $a = Property::factory()->create(['user_id' => $user->id]);
        $b = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $a->id]);

        Sanctum::actingAs($user);

        // Try to make A a child of B → cycle.
        $this->patchJson("/api/properties/{$a->id}", [
            'parent_id' => $b->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['parent_id']);
    }

    public function test_attaching_above_max_depth_returns_422(): void
    {
        $user = User::factory()->create();

        $level1 = Property::factory()->create(['user_id' => $user->id]);
        $level2 = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $level1->id]);
        $level3 = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $level2->id]);
        $level4 = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $level3->id]);
        $orphan = Property::factory()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/properties/{$orphan->id}", [
            'parent_id' => $level4->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['parent_id']);
    }

    public function test_attaching_property_with_subtree_that_overflows_max_depth_returns_422(): void
    {
        // Existing chain: parent (depth 3 after root1→root2 chain).
        $user = User::factory()->create();
        $root = Property::factory()->create(['user_id' => $user->id]);
        $mid = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $root->id]);
        $newParent = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $mid->id]); // depth 3

        // Standalone subtree of height 2 (parent + child). Attaching its root under
        // a depth-3 parent would push the child to depth 5 (> MAX_DEPTH=4).
        $subtreeRoot = Property::factory()->create(['user_id' => $user->id]);
        Property::factory()->create(['user_id' => $user->id, 'parent_id' => $subtreeRoot->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/properties/{$subtreeRoot->id}", [
            'parent_id' => $newParent->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['parent_id']);
    }

    public function test_soft_deleting_parent_nulls_out_children_parent_id(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        $child = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

        $parent->delete(); // soft-delete

        $this->assertDatabaseHas('properties', [
            'id' => $child->id,
            'parent_id' => null,
            'deleted_at' => null,
        ]);
    }

    public function test_attaching_to_different_agency_returns_422(): void
    {
        Role::findOrCreate('super_admin');

        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $admin = User::factory()->create();
        $admin->assignRole('super_admin');

        $child = Property::factory()->create(['user_id' => $admin->id, 'agency_id' => $agencyA->id]);
        $parent = Property::factory()->create(['user_id' => $admin->id, 'agency_id' => $agencyB->id]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/properties/{$child->id}", [
            'parent_id' => $parent->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['parent_id']);
    }

    public function test_valid_attachment_persists_parent_id(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        $child = Property::factory()->create(['user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/properties/{$child->id}", [
            'parent_id' => $parent->id,
        ])->assertOk();

        $this->assertDatabaseHas('properties', [
            'id' => $child->id,
            'parent_id' => $parent->id,
        ]);
    }

    public function test_detach_with_null_parent_id_clears_relation(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        $child = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

        Sanctum::actingAs($user);

        $this->patchJson("/api/properties/{$child->id}", [
            'parent_id' => null,
        ])->assertOk();

        $this->assertDatabaseHas('properties', [
            'id' => $child->id,
            'parent_id' => null,
        ]);
    }

    public function test_deleting_parent_sets_children_parent_id_to_null(): void
    {
        $user = User::factory()->create();
        $parent = Property::factory()->create(['user_id' => $user->id]);
        $child = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $parent->id]);

        // Force-delete to trigger the FK ON DELETE SET NULL (soft-deletes don't
        // touch the row).
        $parent->forceDelete();

        $this->assertDatabaseHas('properties', [
            'id' => $child->id,
            'parent_id' => null,
        ]);
    }

    public function test_hierarchy_service_depth_and_ancestors(): void
    {
        $user = User::factory()->create();
        $a = Property::factory()->create(['user_id' => $user->id]);
        $b = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $a->id]);
        $c = Property::factory()->create(['user_id' => $user->id, 'parent_id' => $b->id]);

        $service = app(HierarchyService::class);

        $this->assertSame(1, $service->depth($a->fresh()));
        $this->assertSame(2, $service->depth($b->fresh()));
        $this->assertSame(3, $service->depth($c->fresh()));

        $chain = $service->ancestors($c->fresh()->load('parent'));
        $this->assertCount(2, $chain);
        $this->assertSame($b->id, $chain[0]->id);
        $this->assertSame($a->id, $chain[1]->id);
    }
}
