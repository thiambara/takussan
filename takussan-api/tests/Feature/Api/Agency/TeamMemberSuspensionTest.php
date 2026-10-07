<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-587 (ADR-0031 §2, AC7) — suspendre un membre DANS l'agence, jamais sur son compte.
 */
class TeamMemberSuspensionTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agencyA;

    private Agency $agencyB;

    private User $adminA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
        $this->adminA = $this->agencyAdmin($this->agencyA);
    }

    private function suspend(User $target, ?Agency $agency = null): TestResponse
    {
        $agency ??= $this->agencyA;

        return $this->postJson("/api/agencies/{$agency->id}/team/{$target->id}/suspend");
    }

    public function test_un_bailleur_de_deux_agences_est_suspendu_de_l_une_et_agit_dans_l_autre(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agencyA)->withOwnerProfile($this->agencyB)->create();
        $profileA = OwnerProfile::query()->where('user_id', $bailleur->id)->where('agency_id', $this->agencyA->id)->firstOrFail();
        $profileB = OwnerProfile::query()->where('user_id', $bailleur->id)->where('agency_id', $this->agencyB->id)->firstOrFail();

        $this->actingAsApi($this->adminA);
        $this->suspend($bailleur)
            ->assertOk()
            ->assertExactJson(['data' => [
                'user_id' => $bailleur->id,
                'profiles' => [['type' => 'owner', 'id' => $profileA->id, 'status' => 'blocked']],
            ]]);

        $this->assertSame('blocked', $profileA->fresh()->status->value);
        $this->assertSame('active', $profileB->fresh()->status->value);
        $this->assertSame(UserStatus::Active, $bailleur->fresh()->status);

        // Il agit dans B : l'auto-bascule ne retient plus que son profil de B, et sa proposition
        // de bien y est rattachée.
        $id = $this->actingAsApi($bailleur->fresh())
            ->postJson('/api/properties', [
                'title' => 'Studio Mermoz',
                'type' => 'apartment',
                'contract_type' => 'rent',
                'rent_period' => 'monthly',
                'price' => 150000,
            ])
            ->assertCreated()
            ->json('data.id');
        $this->assertSame($this->agencyB->id, (int) Property::query()->findOrFail($id)->agency_id);

        $activity = Activity::query()->where('event', 'team_member_suspended')->sole();
        $this->assertSame($this->adminA->id, (int) $activity->causer_id);
        $this->assertSame($this->agencyA->id, $activity->properties['agency_id']);
    }

    public function test_l_administrateur_principal_et_soi_meme_ne_se_suspendent_pas(): void
    {
        $principal = $this->agencyAdmin($this->agencyA);
        $this->agencyA->update(['primary_admin_id' => $principal->id]);

        $this->actingAsApi($this->adminA);
        $this->suspend($principal)->assertStatus(422);
        $this->suspend($this->adminA)->assertStatus(422);

        $this->assertSame('active', AgencyAdminProfile::query()->where('user_id', $principal->id)->sole()->status->value);
        $this->assertSame(0, Activity::query()->where('event', 'team_member_suspended')->count());
    }

    public function test_un_agent_d_une_seule_agence_perd_ses_jetons_et_se_reactive(): void
    {
        $agent = $this->agencyAgent($this->agencyA);
        $agent->createToken('session');
        $profile = AgentProfile::query()->where('user_id', $agent->id)->sole();

        $this->actingAsApi($this->adminA);
        $this->suspend($agent)->assertOk()->assertJsonPath('data.profiles.0.status', 'suspended');

        $this->assertSame('suspended', $profile->fresh()->status->value);
        $this->assertSame(0, $agent->tokens()->count());

        $this->postJson("/api/agencies/{$this->agencyA->id}/team/{$agent->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('data.profiles.0.status', 'active');
        $this->assertSame('active', $profile->fresh()->status->value);
    }

    public function test_un_membre_d_une_autre_agence_ne_se_suspend_pas_ici(): void
    {
        $etranger = $this->agencyAgent($this->agencyB);

        $this->actingAsApi($this->adminA);
        $this->suspend($etranger)->assertStatus(422);
        $this->assertSame('active', AgentProfile::query()->where('user_id', $etranger->id)->sole()->status->value);
    }

    public function test_on_ne_suspend_pas_dans_une_agence_ou_l_on_n_agit_pas(): void
    {
        $agent = $this->agencyAgent($this->agencyA);

        $this->actingAsApi($this->agencyAdmin($this->agencyB));
        $this->suspend($agent)->assertForbidden();
    }

    /** AC12 — `team.suspend` est lue : le rôle d'admin moins elle est refusé. */
    public function test_la_capacite_team_suspend_est_lue(): void
    {
        $agent = $this->agencyAgent($this->agencyA);

        $this->actingAsApi($this->adminWithout($this->agencyA, Capability::TeamSuspend));
        $this->suspend($agent)->assertForbidden();

        $this->actingAsApi($this->agencyAgent($this->agencyA));
        $this->suspend($agent)->assertForbidden();

        $this->actingAsApi($this->adminA);
        $this->suspend($agent)->assertOk();
    }
}
