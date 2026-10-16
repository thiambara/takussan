<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-665 (piste P03.02) — la base de `GET /api/users` est bornée à l'agence active depuis
 * TCK-147, mais `include=…Profiles` chargeait TOUS les profils de la personne, et
 * `filter[role]` cherchait un profil dans n'importe quelle agence. Une personne bailleur dans A
 * et agent dans B livrait à l'admin de A son profil d'agent de B entier (licence, commission,
 * `metadata`), et `filter[role]=agent` révélait qu'elle est agent ailleurs.
 *
 * Décision du porteur : includes et `filter[role]` bornés à l'agence active ;
 * `include=platformProfile` refusé hors console.
 */
class UserAdminIncludeScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private Agency $agencyB;

    /** Bailleur dans A, agent et admin dans B. */
    private User $person;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();

        $this->person = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->person->id, 'agency_id' => $this->agencyA->id]);
        AgentProfile::factory()->create([
            'user_id' => $this->person->id,
            'agency_id' => $this->agencyB->id,
            'license_number' => 'LIC-B-42',
            'commission_rate' => 7.5,
        ]);
        AgencyAdminProfile::factory()->create(['user_id' => $this->person->id, 'agency_id' => $this->agencyB->id]);
    }

    public function test_profile_includes_only_carry_profiles_of_the_active_agency(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $response = $this->apiGet('/api/users?include=agentProfiles,ownerProfiles,agencyAdminProfiles')
            ->assertOk();

        $row = collect($response->json('data'))->firstWhere('id', $this->person->id);
        $this->assertNotNull($row, 'La personne a un profil dans A : elle doit être listée.');

        $this->assertSame([], $row['agent_profiles'], 'Le profil d\'agent de B ne sort pas vers l\'admin de A.');
        $this->assertSame([], $row['agency_admin_profiles'], 'Le profil d\'admin de B ne sort pas vers l\'admin de A.');
        $this->assertSame([$this->agencyA->id], array_column($row['owner_profiles'], 'agency_id'));
        $this->assertStringNotContainsString('LIC-B-42', $response->getContent());
    }

    public function test_profile_include_keeps_sparse_fields_of_the_relation(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $row = collect(
            $this->apiGet('/api/users?include=ownerProfiles&fields[owner_profiles]=id,user_id,agency_id,status')
                ->assertOk()
                ->json('data'),
        )->firstWhere('id', $this->person->id);

        $this->assertSame(['id', 'user_id', 'agency_id', 'status'], array_keys($row['owner_profiles'][0]));
    }

    public function test_role_filter_is_judged_in_the_active_agency(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $agentA = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agentA->id, 'agency_id' => $this->agencyA->id]);

        $agents = collect($this->apiGet('/api/users?filter[role]=agent')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($agents->contains($agentA->id));
        $this->assertFalse($agents->contains($this->person->id), 'Agent dans B ne fait pas d\'elle une agente de A.');

        $admins = collect($this->apiGet('/api/users?filter[role]=agency_admin')->assertOk()->json('data'))->pluck('id');
        $this->assertFalse($admins->contains($this->person->id), 'Admin dans B ne fait pas d\'elle une admin de A.');

        $owners = collect($this->apiGet('/api/users?filter[role]=owner')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($owners->contains($this->person->id));
    }

    public function test_service_provider_role_filter_needs_a_collaboration_with_the_active_agency(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);

        $providerB = ServiceProviderProfile::factory()->create(['user_id' => $this->person->id]);
        $this->collaborate($providerB, $this->agencyB);

        $providerA = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $providerA->id, 'agency_id' => $this->agencyA->id]);
        $this->collaborate(ServiceProviderProfile::factory()->create(['user_id' => $providerA->id]), $this->agencyA);

        $ids = collect($this->apiGet('/api/users?filter[role]=service_provider')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($providerA->id));
        $this->assertFalse($ids->contains($this->person->id), 'Prestataire de B ne fait pas d\'elle une prestataire de A.');
    }

    public function test_platform_profile_is_neither_included_nor_filtered_outside_the_console(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agencyA]);
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $this->person->id]);

        $this->apiGet('/api/users?include=platformProfile')->assertStatus(400);

        $ids = collect($this->apiGet('/api/users?filter[role]=super_admin')->assertOk()->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($this->person->id), 'Être opérateur de la plateforme ne se lit pas depuis une agence.');
    }

    public function test_super_admin_keeps_unbounded_includes(): void
    {
        $this->apiActingAsRole('super_admin');

        $row = collect(
            $this->apiGet('/api/users?include=agentProfiles,platformProfile&per_page=100')->assertOk()->json('data'),
        )->firstWhere('id', $this->person->id);

        $this->assertSame([$this->agencyB->id], array_column($row['agent_profiles'], 'agency_id'));
    }

    private function collaborate(ServiceProviderProfile $profile, Agency $agency): void
    {
        ServiceProviderAgencyCollaboration::create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active,
            'started_at' => now()->toDateString(),
        ]);
    }
}
