<?php

namespace Tests\Feature\Api;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceCompletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_can_complete_with_notes_cost_and_photos(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::InProgress,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", [
            'resolution_notes' => 'Fuite réparée, remplacement joint.',
            'cost' => 25000,
            'photos' => [UploadedFile::fake()->image('done.jpg')],
        ])->assertOk()
            ->assertJsonPath('data.status', MaintenanceStatus::Completed->value)
            ->assertJsonPath('data.resolution_notes', 'Fuite réparée, remplacement joint.')
            ->assertJsonPath('data.actual_cost', 25000);

        $fresh = $mr->refresh();
        $this->assertNotNull($fresh->completed_at);
        $this->assertSame(1, $fresh->getMedia('completion_photos')->count());
    }

    public function test_cannot_complete_already_completed_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Completed,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", [
            'resolution_notes' => 'second attempt',
        ])->assertStatus(422);
    }

    public function test_non_manager_cannot_complete_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::InProgress,
        ]);

        Sanctum::actingAs(User::factory()->create());

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", [
            'resolution_notes' => 'x',
        ])->assertForbidden();
    }

    public function test_cost_and_actual_cost_together_is_rejected(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::InProgress,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", [
            'cost' => 10_000,
            'actual_cost' => 12_000,
        ])->assertStatus(422);
    }

    public function test_cannot_upload_photos_on_cancelled_request(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Cancelled,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [UploadedFile::fake()->image('x.jpg')],
        ])->assertStatus(422);
    }

    public function test_cannot_upload_photos_on_closed_request(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Closed,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [UploadedFile::fake()->image('x.jpg')],
        ])->assertStatus(422);
    }

    public function test_completion_photos_and_initial_photos_stored_in_separate_collections(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => MaintenanceStatus::InProgress,
        ]);

        Sanctum::actingAs($owner);

        // Upload initial photos
        $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [UploadedFile::fake()->image('before.jpg')],
            'collection' => 'photos',
        ])->assertCreated();

        // Then complete with completion photos
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", [
            'photos' => [UploadedFile::fake()->image('after.jpg')],
        ])->assertOk();

        $fresh = $mr->refresh();
        $this->assertSame(1, $fresh->getMedia('photos')->count());
        $this->assertSame(1, $fresh->getMedia('completion_photos')->count());
    }
}
