<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Policies\RoleDelegationPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-285 — `RoleDelegationPolicy::view` (0/3).
 *
 * Une délégation dit QUI a reçu les droits de QUI, pour combien de temps et
 * sous quel motif. C'est une pièce de la piste d'audit des privilèges : la
 * lire renseigne sur l'organisation interne d'une agence, et la lire chez le
 * voisin est une fuite d'un autre genre que celle d'une donnée client.
 *
 * `view` a exactement deux portes — l'administration de l'agence, et le
 * bénéficiaire lui-même — et aucune des deux n'était exercée.
 *
 * ⚠ Acteurs MONO-AGENCE (accesseur `agency_id`, TCK-142).
 */
class RoleDelegationPolicyTest extends TestCase
{
    use RefreshDatabase;

    private RoleDelegationPolicy $policy;

    private Agency $agencyA;

    private Agency $agencyB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->policy = new RoleDelegationPolicy;
        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
    }

    public function test_an_agency_admin_sees_a_delegation_of_his_agency(): void
    {
        $delegation = $this->delegationIn($this->agencyA);

        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyA), $delegation));
    }

    public function test_the_primary_admin_sees_a_delegation_of_his_agency(): void
    {
        // Seconde porte de `viewAny` : `primary_admin_id`, indépendante du
        // profil AgencyAdmin.
        $primary = $this->ownerAt($this->agencyA);
        $this->agencyA->update(['primary_admin_id' => $primary->id]);

        $delegation = $this->delegationIn($this->agencyA);

        $this->assertTrue($this->policy->view($primary->fresh(), $delegation->fresh()));
    }

    public function test_the_beneficiary_sees_his_own_delegation(): void
    {
        $beneficiary = $this->ownerAt($this->agencyA);
        $delegation = $this->delegationIn($this->agencyA, $beneficiary);

        $this->assertTrue($this->policy->view($beneficiary, $delegation));
    }

    public function test_a_colleague_never_sees_a_delegation_addressed_to_someone_else(): void
    {
        // Même agence, mais ni administration ni bénéficiaire : la seconde
        // branche est strictement personnelle. C'est le cas qui distingue
        // « ma délégation » de « les délégations de mon agence ».
        $delegation = $this->delegationIn($this->agencyA);

        $this->assertFalse($this->policy->view($this->agentAt($this->agencyA), $delegation));
    }

    public function test_the_admin_of_another_agency_never_sees_a_delegation(): void
    {
        $delegation = $this->delegationIn($this->agencyA);

        $this->assertFalse($this->policy->view($this->agencyAdminAt($this->agencyB), $delegation));
    }

    public function test_a_user_without_any_profile_sees_nothing(): void
    {
        $delegation = $this->delegationIn($this->agencyA);

        $this->assertFalse($this->policy->view(User::factory()->create(), $delegation));
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function delegationIn(Agency $agency, ?User $beneficiary = null): RoleDelegation
    {
        $beneficiary ??= $this->ownerAt($agency);

        return RoleDelegation::create([
            'user_id' => $beneficiary->id,
            'delegator_id' => User::factory()->create()->id,
            'agency_id' => $agency->id,
            'role' => 'agency_admin',
            'status' => RoleDelegationStatus::Active,
            'starts_at' => now()->subDay(),
            'ends_at' => now()->addDays(7),
            'activated_at' => now()->subDay(),
            'user_native_roles_snapshot' => ['owner'],
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

    private function ownerAt(Agency $agency): User
    {
        $user = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user->fresh();
    }
}
