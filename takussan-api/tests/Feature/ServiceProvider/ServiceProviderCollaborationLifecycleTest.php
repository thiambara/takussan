<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC7 (B17) et les endpoints de fin / pause / reprise d'une collaboration.
 *
 * Aucun endpoint ne mettait fin à une collaboration, et la contrainte d'unicité ignorait
 * `deleted_at` : une ligne supprimée en douceur interdisait toute ré-invitation du même couple
 * (23505).
 */
class ServiceProviderCollaborationLifecycleTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_end_then_resume_keeps_a_single_live_row(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        $provider = $this->providerFor($agency);
        $sp = $provider->serviceProviderProfile;

        Sanctum::actingAs($admin);
        $url = "/api/agencies/{$agency->id}/service-providers/{$sp->id}/collaboration";

        $this->patchJson($url, ['status' => 'ended'])->assertOk()->assertJsonPath('data.status', 'ended');
        $this->patchJson($url, ['status' => 'active'])->assertOk()->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.ended_at', null);

        $rows = ServiceProviderAgencyCollaboration::query()
            ->where('service_provider_profile_id', $sp->id)->where('agency_id', $agency->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame(CollaborationStatus::Active, $rows->sole()->status);
    }

    /** Une ligne supprimée en douceur ne bloque plus une création du même couple. */
    public function test_soft_deleted_row_does_not_block_a_new_one(): void
    {
        $agency = Agency::factory()->create();
        $sp = $this->providerFor($agency)->serviceProviderProfile;

        ServiceProviderAgencyCollaboration::query()->where('service_provider_profile_id', $sp->id)->sole()->delete();

        $fresh = ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);

        $this->assertNotNull($fresh->id);
        $this->assertSame(2, ServiceProviderAgencyCollaboration::withTrashed()->where('service_provider_profile_id', $sp->id)->count());
    }

    public function test_agency_pause_is_recorded_and_closes_access(): void
    {
        [$agency, $admin] = $this->agencyWithAdmin();
        ['mr' => $mr, 'provider' => $provider] = $this->scenarioIn($agency, MaintenanceStatus::InProgress);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$provider->serviceProviderProfile->id}/collaboration", ['status' => 'paused'])
            ->assertOk()
            ->assertJsonPath('data.status', 'paused')
            ->assertJsonPath('data.paused_by', $admin->id);

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
    }

    public function test_provider_ends_own_collaboration_and_keeps_completed_work(): void
    {
        $agency = Agency::factory()->create();
        ['mr' => $running, 'provider' => $provider, 'property' => $property] = $this->scenarioIn($agency, MaintenanceStatus::InProgress);
        $done = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::Completed,
        ]);
        $collaboration = $provider->serviceProviderProfile->agencyCollaborations()->sole();

        Sanctum::actingAs($provider);
        $this->patchJson("/api/me/service-provider/collaborations/{$collaboration->id}", ['status' => 'ended'])->assertOk();

        $this->assertNull($running->refresh()->assigned_to);
        $this->assertSame(MaintenanceStatus::Open, $running->status);
        $this->assertSame($provider->id, $done->refresh()->assigned_to);
        $this->assertSame(MaintenanceStatus::Completed, $done->status);
    }

    /** La pause et la reprise sont des gestes de l'agence, pas du prestataire. */
    public function test_provider_cannot_pause_or_resume(): void
    {
        $agency = Agency::factory()->create();
        $provider = $this->providerFor($agency);
        $collaboration = $provider->serviceProviderProfile->agencyCollaborations()->sole();

        Sanctum::actingAs($provider);
        $this->patchJson("/api/me/service-provider/collaborations/{$collaboration->id}", ['status' => 'paused'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$provider->serviceProviderProfile->id}/collaboration", ['status' => 'paused'])
            ->assertForbidden();

        $this->assertSame(CollaborationStatus::Active, $collaboration->refresh()->status);
    }

    public function test_another_user_cannot_end_someone_elses_collaboration(): void
    {
        $agency = Agency::factory()->create();
        $collaboration = $this->providerFor($agency)->serviceProviderProfile->agencyCollaborations()->sole();

        Sanctum::actingAs($this->providerFor($agency));
        $this->patchJson("/api/me/service-provider/collaborations/{$collaboration->id}", ['status' => 'ended'])->assertForbidden();

        $this->assertSame(CollaborationStatus::Active, $collaboration->refresh()->status);
    }

    public function test_agent_without_invite_right_cannot_change_a_collaboration(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($this->agentOf($agency));
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$provider->serviceProviderProfile->id}/collaboration", ['status' => 'ended'])
            ->assertForbidden();
    }

    /** @return array{Agency, User} */
    private function agencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    /** @return array{mr: MaintenanceRequest, provider: User, property: Property} */
    private function scenarioIn(Agency $agency, MaintenanceStatus $status): array
    {
        $landlord = $this->landlordOf($agency);
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $provider = $this->providerFor($agency);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $provider->id,
            'status' => $status,
        ]);

        return compact('mr', 'provider', 'property');
    }
}
