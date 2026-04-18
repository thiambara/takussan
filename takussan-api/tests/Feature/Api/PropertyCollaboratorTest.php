<?php

namespace Tests\Feature\Api;

use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyCollaboratorTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_add_collaborator(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $collaborator = User::factory()->create();

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 10,
        ])->assertCreated()
            ->assertJsonPath('data.role', CollaboratorRole::Agent->value)
            ->assertJsonPath('data.commission_share', '10.00');

        $this->assertDatabaseCount('property_collaborators', 1);
    }

    public function test_cannot_add_duplicate_collaborator(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $collaborator = User::factory()->create();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent->value,
        ])->assertStatus(422);
    }

    public function test_owner_can_list_collaborators(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => User::factory()->create()->id,
            'role' => CollaboratorRole::Manager->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/collaborators")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_owner_can_update_collaborator_role(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => User::factory()->create()->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/collaborators/{$collab->id}", [
            'role' => CollaboratorRole::Manager->value,
        ])->assertOk()
            ->assertJsonPath('data.role', CollaboratorRole::Manager->value);
    }

    public function test_owner_can_remove_collaborator(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => User::factory()->create()->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->deleteJson("/api/properties/{$property->id}/collaborators/{$collab->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('property_collaborators', ['id' => $collab->id]);
    }

    public function test_random_user_cannot_access_collaborators(): void
    {
        $property = Property::factory()->create();

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$property->id}/collaborators")
            ->assertForbidden();
    }
}
