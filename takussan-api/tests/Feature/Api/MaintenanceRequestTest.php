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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MaintenanceRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_creates_maintenance_request(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite robinet cuisine',
            'description' => 'Fuite continue',
            'category' => 'plumbing',
            'priority' => 'high',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.priority', 'high');
    }

    /**
     * TCK-1001 (P48.04) — un locataire en préavis (`terminating`) habite encore le logement :
     * il demande une intervention comme un locataire `active`. Un bail clos, lui, n'ouvre rien.
     *
     * @return array<string, array{LeaseStatus, int}>
     */
    public static function statutsDuBailDuDemandeur(): array
    {
        return [
            'actif' => [LeaseStatus::Active, 201],
            'en préavis' => [LeaseStatus::Terminating, 201],
            'résilié' => [LeaseStatus::Terminated, 403],
            'expiré' => [LeaseStatus::Expired, 403],
        ];
    }

    #[DataProvider('statutsDuBailDuDemandeur')]
    public function test_tenant_lease_status_decides_maintenance_creation(LeaseStatus $statut, int $attendu): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
            'landlord_id' => $property->user_id,
            'status' => $statut,
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fuite robinet cuisine',
            'description' => 'Fuite continue',
            'category' => 'plumbing',
        ])->assertStatus($attendu);
    }

    public function test_unrelated_user_cannot_create_maintenance_request(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Bogus',
            'description' => 'not a tenant',
            'category' => 'plumbing',
        ])->assertForbidden();
    }

    public function test_owner_can_update_status(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        // TCK-592 — le statut ne passe plus par `PATCH` : la machine d'état seule l'écrit.
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'estimated_cost' => 50000,
        ])->assertOk()
            ->assertJsonPath('data.estimated_cost', 50000);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => 'in_progress',
        ])->assertOk()
            ->assertJsonPath('data.status', 'in_progress');
    }

    public function test_owner_can_show_maintenance_request(): void
    {
        $owner = User::factory()->create();
        $requester = User::factory()->create(['first_name' => 'Mamadou', 'last_name' => 'Fall']);
        $assignee = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop']);
        $property = Property::factory()->create(['user_id' => $owner->id, 'title' => 'Villa Ngor']);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => $requester->id,
            'assigned_to' => $assignee->id,
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/maintenance-requests/{$mr->id}?include=property,requester,assignee")
            ->assertOk()
            ->assertJsonPath('data.id', $mr->id)
            ->assertJsonPath('data.property.title', 'Villa Ngor')
            ->assertJsonPath('data.requester.name', 'Mamadou Fall')
            ->assertJsonPath('data.assignee.name', 'Awa Diop');
    }

    public function test_owner_can_show_maintenance_request_with_quote_decision_actor(): void
    {
        $owner = User::factory()->create();
        $decisionBy = User::factory()->create([
            'first_name' => 'Fatou',
            'last_name' => 'Ndiaye',
            'email' => 'fatou.ndiaye@example.test',
            'username' => 'fatou-ndiaye',
        ]);
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'quote_decision_by_id' => $decisionBy->id,
            'quote_decision_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/maintenance-requests/{$mr->id}?include=quoteDecisionBy")
            ->assertOk()
            ->assertJsonPath('data.quote_decision_by.id', $decisionBy->id)
            ->assertJsonPath('data.quote_decision_by.name', 'Fatou Ndiaye')
            ->assertJsonPath('data.quote_decision_by.email', 'fatou.ndiaye@example.test')
            ->assertJsonPath('data.quote_decision_by.username', 'fatou-ndiaye');
    }

    public function test_owner_can_resolve_maintenance_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
            'status' => 'in_progress',
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", [
            'resolution_notes' => 'Fuite réparée avec succès.',
            'actual_cost' => 45000,
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_owner_can_cancel_maintenance_request(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'requester_id' => User::factory()->create()->id,
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", [
            'status' => 'cancelled',
            // TCK-2917 — qui annule dit pourquoi (ADR-0118 § 1).
            'reason' => 'Doublon',
        ])->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    // Photos du signalement (TCK-3017 : ex-MaintenanceReportTest).

    public function test_tenant_can_report_problem_with_photos(): void
    {
        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));

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

    public function test_reporter_can_upload_initial_photos_after_creation(): void
    {
        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));

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
