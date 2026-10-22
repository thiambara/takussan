<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1412 (P148.01, P148.02) — la liste de l'équipe (`GET /api/users`) se lit sous la capacité
 * qui ouvre la section `team` du front (`team.invite`, `team.assign_role` ou `team.suspend`),
 * délégations comprises, et plus seulement par le profil `agency_admin`.
 *
 * Avant ce ticket, un agent qui tenait `team.invite` (par un rôle personnalisé ou une délégation
 * `agency_admin`) invitait par l'API (201) mais se voyait refuser la liste (403).
 */
class UserAdminCapabilityAccessTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create([
            'kind' => AgencyKind::Standard,
            'primary_admin_id' => null,
        ]);
    }

    /** Un agent de l'agence dont TOUS les profils portent exactement `$capabilities`. */
    private function agentAvecCapacites(array $capabilities): User
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $this->agency->id]);

        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $this->agency->id]);

        // `User::factory()` pose aussi un `OwnerProfile` sur l'agence (shim de TCK-142) : chaque
        // profil passe sur le même rôle, le résolveur étant additif.
        foreach ([AgentProfile::class, OwnerProfile::class] as $classe) {
            $classe::query()
                ->where('user_id', $user->id)
                ->where('agency_id', $this->agency->id)
                ->update(['agency_role_id' => $role->id]);
        }

        return $user->fresh();
    }

    public function test_un_agent_qui_tient_team_invite_lit_la_liste_de_son_agence(): void
    {
        $agent = $this->agentAvecCapacites([Capability::TeamInvite]);

        $collegue = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $collegue->id, 'agency_id' => $this->agency->id]);
        $ailleurs = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $ailleurs->id, 'agency_id' => Agency::factory()->create()->id]);

        $ids = collect($this->actingAs($agent)->getJson('/api/users')->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($collegue->id));
        $this->assertFalse($ids->contains($ailleurs->id));
    }

    public function test_team_assign_role_et_team_suspend_ouvrent_aussi_la_liste(): void
    {
        foreach ([Capability::TeamAssignRole, Capability::TeamSuspend] as $capacite) {
            $agent = $this->agentAvecCapacites([$capacite]);

            $this->actingAs($agent)->getJson('/api/users')->assertOk();
        }
    }

    public function test_un_delegataire_agency_admin_lit_la_liste(): void
    {
        $delegant = User::factory()->create(['agency_id' => $this->agency->id]);
        AgencyAdminProfile::query()->create(['user_id' => $delegant->id, 'agency_id' => $this->agency->id]);
        $beneficiaire = $this->agentAvecCapacites([]);

        RoleDelegation::query()->create([
            'user_id' => $beneficiaire->id,
            'delegator_id' => $delegant->id,
            'agency_id' => $this->agency->id,
            'role' => 'agency_admin',
            'starts_at' => null,
            'ends_at' => now()->addWeek(),
            'status' => RoleDelegationStatus::Active,
            'activated_at' => now(),
            'user_native_roles_snapshot' => [],
        ]);

        $this->actingAs($beneficiaire->fresh())->getJson('/api/users')->assertOk();
    }

    public function test_un_agent_sans_capacite_d_equipe_reste_refuse(): void
    {
        $agent = $this->agentAvecCapacites([Capability::LeasesCreate]);

        $this->actingAs($agent)->getJson('/api/users')->assertForbidden();
    }
}
