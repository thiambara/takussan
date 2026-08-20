<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Policies\OwnerProfilePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-285 — `OwnerProfilePolicy::viewAny` (0/4) et `::view` (0/5).
 *
 * Un `OwnerProfile` porte le RIB, le NINEA, le type et le numéro de pièce
 * d'identité et le revenu mensuel d'un bailleur. C'est la fiche la plus
 * sensible du portefeuille d'une agence, et ses deux méthodes de lecture
 * n'étaient jamais exécutées.
 *
 * ⚠ Acteurs MONO-AGENCE : `$user->agency_id` est un accesseur dérivé du
 * profil actif (TCK-142) qui, hors requête HTTP, ne se résout que par
 * l'auto-bascule « un seul profil, une seule agence ».
 */
class OwnerProfilePolicyTest extends TestCase
{
    use RefreshDatabase;

    private OwnerProfilePolicy $policy;

    private Agency $agencyA;

    private Agency $agencyB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->policy = new OwnerProfilePolicy;
        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
    }

    // ─── viewAny ─────────────────────────────────────────────────

    public function test_agency_staff_can_list_owner_profiles(): void
    {
        $this->assertTrue($this->policy->viewAny($this->agencyAdminAt($this->agencyA)));
        $this->assertTrue($this->policy->viewAny($this->agentAt($this->agencyA)));
    }

    public function test_an_owner_cannot_list_the_owner_portfolio(): void
    {
        // Un bailleur est DANS l'agence mais n'est pas du personnel : lui
        // ouvrir la liste lui livrerait les RIB de ses confrères.
        $this->assertFalse($this->policy->viewAny($this->ownerAt($this->agencyA)));
    }

    public function test_a_user_without_any_profile_cannot_list_owner_profiles(): void
    {
        $this->assertFalse($this->policy->viewAny(User::factory()->create()));
    }

    // ─── view ────────────────────────────────────────────────────

    public function test_agency_staff_see_an_owner_profile_of_their_own_agency(): void
    {
        $profile = OwnerProfile::factory()->create(['agency_id' => $this->agencyA->id]);

        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyA), $profile));
        $this->assertTrue($this->policy->view($this->agentAt($this->agencyA), $profile));
    }

    public function test_agency_staff_never_see_an_owner_profile_of_another_agency(): void
    {
        // La fuite : RIB, NINEA et pièce d'identité d'un bailleur de B.
        $profile = OwnerProfile::factory()->create(['agency_id' => $this->agencyB->id]);

        $this->assertFalse($this->policy->view($this->agencyAdminAt($this->agencyA), $profile));
        $this->assertFalse($this->policy->view($this->agentAt($this->agencyA), $profile));
    }

    public function test_an_owner_sees_his_own_profile(): void
    {
        $owner = User::factory()->create();
        $profile = OwnerProfile::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $this->agencyA->id,
        ]);

        $this->assertTrue($this->policy->view($owner->fresh(), $profile));
    }

    public function test_an_owner_never_sees_the_profile_of_another_owner(): void
    {
        // Même agence, autre bailleur : la branche non-staff est strictement
        // personnelle. C'est le cas qui distingue « mon dossier » de « les
        // dossiers de mon agence ».
        $owner = $this->ownerAt($this->agencyA);
        $confrere = OwnerProfile::factory()->create(['agency_id' => $this->agencyA->id]);

        $this->assertFalse($this->policy->view($owner, $confrere));
    }

    // ─── Helpers ─────────────────────────────────────────────────

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
