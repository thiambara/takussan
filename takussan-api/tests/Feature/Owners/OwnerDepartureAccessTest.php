<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Owners\OwnerDepartureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2753 (ADR-0108 § 7), AC8 — qui fait partir un bailleur : l'administrateur ACTIF de l'agence du
 * profil, sous double authentification, et le super-admin. Jamais un agent, quel que soit son rôle
 * personnalisé : le geste n'est pas une capacité déléguable.
 *
 * Hors de l'agence, un profil n'existe pas pour l'appelant (404, comme la fiche — précédent
 * b54b127a6) ; dans l'agence, le refus de la policy est un 403.
 */
class OwnerDepartureAccessTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private OwnerProfile $profile;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $this->profile = OwnerProfile::query()->where('user_id', $landlord->id)->firstOrFail();
    }

    private function assertNotDeparted(): void
    {
        $this->assertSame(OwnerProfileStatus::Active, $this->profile->fresh()->status);
        $this->assertSame(0, Activity::query()->where('event', OwnerDepartureService::EVENEMENT)->count());
    }

    public function test_un_agent_portant_toutes_les_capacites_est_refuse(): void
    {
        $this->actingAs($this->agentWith($this->agency, ...Capability::cases()), 'sanctum');

        $this->getJson("/api/owners/{$this->profile->id}/departure")->assertForbidden();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertForbidden();
        $this->assertNotDeparted();
    }

    public function test_l_administrateur_d_une_autre_agence_ne_voit_pas_le_profil(): void
    {
        $this->actingAs($this->agencyAdmin(Agency::factory()->create()), 'sanctum');

        $this->getJson("/api/owners/{$this->profile->id}/departure")->assertNotFound();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertNotFound();
        $this->assertNotDeparted();
    }

    public function test_l_administrateur_sans_double_authentification_est_refuse_par_la_garde(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false]);

        $this->deleteJson("/api/owners/{$this->profile->id}")->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertNotDeparted();
        // La lecture reste ouverte : la garde ne juge que les gestes.
        $this->getJson("/api/owners/{$this->profile->id}/departure")->assertOk()->assertJsonPath('data.can_depart', true);
    }

    public function test_un_jeton_qui_n_a_pas_vu_le_second_facteur_est_refuse_par_la_garde(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        /** @var PersonalAccessToken $token */
        $token = $admin->tokens()->create(['name' => 'oauth', 'token' => hash('sha256', Str::random(40)), 'abilities' => ['*']]);
        $this->actingAs($admin->withAccessToken($token), 'sanctum');

        $this->deleteJson("/api/owners/{$this->profile->id}")->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertNotDeparted();
    }

    public function test_l_administrateur_de_l_agence_fait_partir_le_bailleur(): void
    {
        $this->actingAs($this->agencyAdmin($this->agency), 'sanctum');

        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk()->assertJsonPath('data.status', 'inactive');
    }

    public function test_le_super_admin_avec_sa_double_authentification_fait_partir_le_bailleur(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson("/api/owners/{$this->profile->id}/departure")->assertOk()->assertJsonPath('data.can_depart', true);
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk()->assertJsonPath('data.status', 'inactive');
    }

    public function test_un_administrateur_suspendu_de_l_agence_est_refuse(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $admin->agencyAdminProfiles()->update(['status' => 'suspended']);
        $this->actingAs($admin->fresh(), 'sanctum');

        // Suspendu, il n'est plus du personnel de l'agence (`staffAgencyId()`) : le profil n'existe pas pour lui.
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertNotFound();
        $this->assertNotDeparted();
    }
}
