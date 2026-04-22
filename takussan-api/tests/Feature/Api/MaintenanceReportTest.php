<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MaintenanceReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_can_report_problem_with_photos(): void
    {
        Storage::fake('public');

        $tenantUser = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $tenantUser->id]);
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);

        Sanctum::actingAs($tenantUser);

        // 1. Report the problem
        $report = $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Problème de chauffage',
            'description' => 'Radiateur du salon ne chauffe plus.',
            'category' => 'electrical',
            'priority' => 'high',
        ])->assertCreated();

        $mrId = $report->json('data.id');
        $this->assertNotNull($mrId);

        // 2. Attach initial photos
        $this->postJson("/api/maintenance-requests/{$mrId}/photos", [
            'photos' => [UploadedFile::fake()->image('photo.jpg')],
            'collection' => 'photos',
        ])->assertCreated()
            ->assertJsonCount(1, 'data');

        $mr = MaintenanceRequest::findOrFail($mrId);
        $this->assertSame(1, $mr->getMedia('photos')->count());
    }

    public function test_unrelated_user_cannot_report_maintenance(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Hack attempt',
            'description' => 'not a tenant',
            'category' => 'plumbing',
        ])->assertForbidden();
    }

    public function test_reporter_can_upload_initial_photos_after_creation(): void
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $owner->id,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [
                UploadedFile::fake()->image('p1.jpg'),
                UploadedFile::fake()->image('p2.jpg'),
            ],
        ])->assertCreated()
            ->assertJsonCount(2, 'data');

        $this->assertSame(2, $mr->refresh()->getMedia('photos')->count());
    }
}
