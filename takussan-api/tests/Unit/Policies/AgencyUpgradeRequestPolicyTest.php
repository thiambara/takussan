<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Policies\AgencyUpgradeRequestPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-285 — `AgencyUpgradeRequestPolicy::view` (0/4), `::approve` (0/1) et
 * `::reject` (0/1).
 *
 * Une demande d'upgrade porte le RC, le NINEA, le RIB professionnel et
 * l'adresse fiscale d'une société. `approve` et `reject` sont, elles, des
 * décisions de PLATEFORME : les ouvrir à un acteur d'agence lui permettrait
 * de s'auto-promouvoir.
 *
 * Le docblock de la policy note que « la route est déjà gardée par le
 * middleware `super-admin` » — raison de plus pour éprouver la policy
 * elle-même : elle existe précisément pour les appelants hors HTTP (CLI,
 * jobs), là où le middleware ne passe pas. Une garde de second rideau qui
 * n'est jamais exécutée ne garde rien le jour où le premier rideau tombe.
 *
 * ⚠ Acteurs MONO-AGENCE (accesseur `agency_id`, TCK-142). `approve` et
 * `reject` ne lisent que `isSuperAdmin()`, donc l'accesseur n'y joue aucun
 * rôle.
 */
class AgencyUpgradeRequestPolicyTest extends TestCase
{
    use RefreshDatabase;

    private AgencyUpgradeRequestPolicy $policy;

    private Agency $agencyA;

    private Agency $agencyB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->policy = new AgencyUpgradeRequestPolicy;
        $this->agencyA = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->agencyB = Agency::factory()->create(['kind' => AgencyKind::Individual]);
    }

    // ─── view ────────────────────────────────────────────────────

    public function test_an_agency_admin_sees_the_upgrade_request_of_his_agency(): void
    {
        $request = $this->requestFor($this->agencyA);

        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyA), $request));
    }

    public function test_an_agency_admin_never_sees_the_upgrade_request_of_another_agency(): void
    {
        // RC, NINEA, RIB pro et adresse fiscale d'une autre société.
        $request = $this->requestFor($this->agencyB);

        $this->assertFalse($this->policy->view($this->agencyAdminAt($this->agencyA), $request));
    }

    public function test_an_agent_never_sees_the_upgrade_request_of_his_own_agency(): void
    {
        // Le témoin « membre » ≠ « administration » : l'agent est bien dans A.
        $request = $this->requestFor($this->agencyA);

        $this->assertFalse($this->policy->view($this->agentAt($this->agencyA), $request));
    }

    public function test_a_user_without_any_profile_sees_nothing(): void
    {
        $request = $this->requestFor($this->agencyA);

        $this->assertFalse($this->policy->view(User::factory()->create(), $request));
    }

    // ─── approve / reject ────────────────────────────────────────

    public function test_only_a_super_admin_can_approve(): void
    {
        $request = $this->requestFor($this->agencyA);

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $this->assertTrue($this->policy->approve($superAdmin->fresh(), $request));
    }

    public function test_an_agency_admin_can_never_approve_his_own_upgrade(): void
    {
        // Le cas qui compte : sans lui, l'agence se promeut toute seule.
        // La policy est instanciée directement, donc AUCUN `Gate::before` ne
        // vient masquer le résultat — c'est bien `isSuperAdmin()` qu'on mesure.
        $request = $this->requestFor($this->agencyA);

        $this->assertFalse($this->policy->approve($this->agencyAdminAt($this->agencyA), $request));
    }

    public function test_only_a_super_admin_can_reject(): void
    {
        $request = $this->requestFor($this->agencyA);

        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $this->assertTrue($this->policy->reject($superAdmin->fresh(), $request));
        $this->assertFalse($this->policy->reject($this->agencyAdminAt($this->agencyA), $request));
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function requestFor(Agency $agency): AgencyUpgradeRequest
    {
        return AgencyUpgradeRequest::factory()->create([
            'agency_id' => $agency->id,
            'submitted_by' => User::factory()->create()->id,
        ]);
    }

    private function agencyAdminAt(Agency $agency): User
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user->fresh();
    }

    private function agentAt(Agency $agency): User
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user->fresh();
    }
}
