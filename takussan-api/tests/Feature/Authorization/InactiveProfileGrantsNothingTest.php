<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §3, AC13) — un profil non actif ne confère rien.
 *
 * Avant ce ticket, suspendre un agent ne changeait rien à ce qu'il pouvait faire : `roleAllows()`
 * lisait le rôle de tout profil sans filtre de statut, `isAgencyAdminAt()` ne filtrait que
 * `deleted_at`, et l'auto-bascule rebasculait l'agent suspendu dans son agence à chaque requête.
 * La suspension était un statut affiché, pas un effet.
 *
 * Chacun des trois `->active()` a ici une assertion qui ne tient que par lui :
 *  - l'auto-bascule : `meta.active_profile_id` de `GET /api/me/profiles` ;
 *  - `isAgencyAdminAt()` et `roleAllows()` : le co-admin suspendu, que la policy de l'équipe juge
 *    par l'un PUIS par l'autre (`AgentProfilePolicy::canManageTeamIn`).
 */
class InactiveProfileGrantsNothingTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);

        $landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    public function test_un_agent_suspendu_perd_les_baux_de_l_agence_et_les_retrouve_reactive(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $profile = AgentProfile::query()->where('user_id', $agent->id)->firstOrFail();

        // Témoin : actif, il lit le bail et le trouve dans la liste.
        $this->assertAgentReadsTheLease($agent, true);

        $this->actingAsApi($this->admin)
            ->patchJson("/api/profiles/{$profile->id}/suspend")
            ->assertOk();

        $this->assertAgentReadsTheLease($agent, false);

        // L'auto-bascule ne le remet plus dans l'agence de son profil suspendu.
        $this->actingAsApi($agent->fresh())
            ->getJson('/api/me/profiles')
            ->assertOk()
            ->assertJsonPath('meta.active_profile_id', null)
            ->assertJsonPath('meta.count', 0);

        $this->actingAsApi($this->admin)
            ->patchJson("/api/profiles/{$profile->id}/suspend", ['active' => true])
            ->assertOk();

        $this->assertAgentReadsTheLease($agent, true);
    }

    public function test_un_co_admin_suspendu_ne_suspend_plus_personne(): void
    {
        $coAdmin = $this->agencyAdmin($this->agency);
        $coAdminProfile = AgencyAdminProfile::query()->where('user_id', $coAdmin->id)->firstOrFail();
        $agent = $this->agencyAgent($this->agency);
        $agentProfile = AgentProfile::query()->where('user_id', $agent->id)->firstOrFail();

        $coAdminProfile->forceFill(['status' => AgencyAdminProfileStatus::Suspended])->save();

        $this->actingAsApi($coAdmin)
            ->patchJson("/api/profiles/{$agentProfile->id}/suspend")
            ->assertForbidden();
        $this->assertSame('active', $agentProfile->fresh()->status->value);

        $coAdminProfile->forceFill(['status' => AgencyAdminProfileStatus::Active])->save();

        $this->actingAsApi($coAdmin)
            ->patchJson("/api/profiles/{$agentProfile->id}/suspend")
            ->assertOk();
        $this->assertSame('suspended', $agentProfile->fresh()->status->value);
    }

    private function assertAgentReadsTheLease(User $agent, bool $expected): void
    {
        // Un modèle neuf, comme à chaque vraie requête : l'instance du test garde en mémoire les
        // relations de profils chargées par la requête précédente.
        $this->actingAsApi($agent->fresh());

        $this->getJson("/api/leases/{$this->lease->id}")->assertStatus($expected ? 200 : 403);

        $ids = array_map(
            static fn (array $row): int => (int) $row['id'],
            $this->getJson('/api/leases')->assertOk()->json('data') ?? [],
        );
        $expected
            ? $this->assertContains($this->lease->id, $ids)
            : $this->assertSame([], $ids, 'aucun bail de l\'agence pour un agent suspendu');
    }
}
