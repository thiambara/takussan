<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-587 (ADR-0031 §1) — `MembershipCapabilityResolver::staffAgencyId()`, le seul prédicat du
 * périmètre d'agence : l'agence du profil actif si l'utilisateur y est PERSONNEL (agent ou admin
 * ACTIF, ou délégation active de ces rôles), sinon `null`.
 *
 * Le cas qui compte est le bailleur seul : `$user->agency_id` lui rend son agence, et c'est
 * exactement ce que les clauses de périmètre lisaient.
 */
class StaffAgencyIdTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    public function test_un_agent_actif_est_personnel_de_son_agence(): void
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);

        $this->assertSame($this->agency->id, $agent->staffAgencyId());
    }

    public function test_un_agent_suspendu_ne_l_est_plus(): void
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $this->agency->id,
            'status' => AgentProfileStatus::Suspended,
        ]);

        $this->assertNull($agent->staffAgencyId());
    }

    public function test_un_admin_actif_est_personnel_et_un_admin_suspendu_non(): void
    {
        $admin = User::factory()->create();
        $profile = AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $this->agency->id]);

        $this->assertSame($this->agency->id, $admin->staffAgencyId());

        $profile->forceFill(['status' => AgencyAdminProfileStatus::Suspended])->save();

        $this->assertNull($admin->fresh()->staffAgencyId());
    }

    public function test_un_bailleur_seul_a_une_agence_mais_n_en_est_pas_le_personnel(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();

        // C'est l'écart que les clauses de périmètre ne voyaient pas : `agency_id` est bien là.
        $this->assertSame($this->agency->id, $bailleur->agency_id);
        $this->assertNull($bailleur->staffAgencyId());
    }

    public function test_un_bailleur_qui_est_aussi_agent_de_la_meme_agence_est_personnel(): void
    {
        $user = User::factory()->withOwnerProfile($this->agency)->withAgentProfile($this->agency)->create();

        $this->assertSame($this->agency->id, $user->staffAgencyId());
    }

    /**
     * Vérification adverse (verif-587, m4) — l'agent suspendu SEUL retombe à `agency_id` nul par le
     * repli, et le filtre de statut d'`isStaffAt()` n'y est pour rien. Bailleur actif de la même
     * agence, il garde `agency_id` : seul ce filtre le sort du personnel.
     */
    public function test_un_agent_suspendu_et_bailleur_actif_de_la_meme_agence_n_est_pas_personnel(): void
    {
        $user = User::factory()->withOwnerProfile($this->agency)->withAgentProfile($this->agency)->create();
        AgentProfile::query()->where('user_id', $user->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $user = $user->fresh();

        $this->assertSame($this->agency->id, $user->agency_id);
        $this->assertNull($user->staffAgencyId());
    }

    public function test_multi_agences_sans_profil_actif_n_a_aucun_perimetre(): void
    {
        $autre = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($this->agency)->withAgentProfile($autre)->create();

        $this->assertNull($agent->agency_id);
        $this->assertNull($agent->staffAgencyId());
    }

    public function test_une_delegation_active_d_agent_rend_personnel_et_une_delegation_echue_non(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $delegation = RoleDelegation::factory()->forRole('agent')->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->assertSame($this->agency->id, $bailleur->staffAgencyId());

        $delegation->forceFill(['ends_at' => now()->subMinute()])->save();

        $this->assertNull($bailleur->staffAgencyId());
    }

    public function test_une_delegation_de_role_bailleur_ne_rend_pas_personnel(): void
    {
        $bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        RoleDelegation::factory()->forRole('owner')->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->assertNull($bailleur->staffAgencyId());
    }

    public function test_un_bailleur_suspendu_n_a_plus_d_agence_par_le_repli(): void
    {
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'status' => 'blocked',
        ]);

        // ADR-0031 §3 — le repli de `getAgencyIdAttribute()` ne retient que les profils actifs.
        $this->assertNull($bailleur->agency_id);
    }
}
