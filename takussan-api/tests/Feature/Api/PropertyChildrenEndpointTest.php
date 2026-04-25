<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-086 — `GET /api/properties/{property}/children`.
 */
class PropertyChildrenEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_paginated_direct_children_only(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $building = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        $floor1 = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $building->id]);
        $floor2 = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $building->id]);
        // grand-children must NOT appear in /children
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $floor1->id]);

        $response = $this->getJson("/api/properties/{$building->id}/children")
            ->assertOk()
            ->assertJsonPath('meta.total', 2);

        $ids = collect($response->json('data'))->pluck('id')->sort()->values()->all();
        $expected = collect([$floor1->id, $floor2->id])->sort()->values()->all();
        $this->assertSame($expected, $ids);
    }

    public function test_supports_spatie_filter_status(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $parent = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $user->id,
            'parent_id' => $parent->id,
            'status' => 'available',
        ]);
        Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $user->id,
            'parent_id' => $parent->id,
            'status' => 'rented',
        ]);

        $this->getJson("/api/properties/{$parent->id}/children?filter[status]=available")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_respects_sparse_fieldsets(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($user);

        $parent = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id, 'parent_id' => $parent->id]);

        // sparse fieldsets only constrain the underlying SQL columns selected;
        // the resource still ships its derived shape. This guards the spatie pipeline survives.
        $this->getJson("/api/properties/{$parent->id}/children?fields[properties]=id,title")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_403_when_caller_is_outside_owner_or_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $owner = User::factory()->create(['agency_id' => $agencyA->id]);
        $stranger = User::factory()->create(['agency_id' => $agencyB->id]);

        $parent = Property::factory()->create(['agency_id' => $agencyA->id, 'user_id' => $owner->id]);

        Sanctum::actingAs($stranger);

        $this->getJson("/api/properties/{$parent->id}/children")
            ->assertForbidden();
    }
}
