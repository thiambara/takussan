<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Policies\Profiles\ServiceProviderProfilePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-285 — `ServiceProviderProfilePolicy::view` : 10 lignes, zéro exécution.
 *
 * C'est la méthode la plus longue des policies mesurées à 0, et la seule dont
 * la portée ne se lit pas sur une colonne : un prestataire n'appartient pas à
 * une agence, il COLLABORE avec elle. La frontière est donc une ligne de
 * `service_provider_agency_collaborations`, et rien dans le typage ne
 * rappelle qu'il faut la consulter — le docblock de la policy dit d'ailleurs
 * que « l'index controller filtre déjà par agency_id », ce qui laisse cette
 * méthode seule à garder la route show.
 *
 * ⚠ Acteurs MONO-AGENCE (accesseur `agency_id`, TCK-142).
 */
class ServiceProviderProfilePolicyTest extends TestCase
{
    use RefreshDatabase;

    private ServiceProviderProfilePolicy $policy;

    private Agency $agencyA;

    private Agency $agencyB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->policy = new ServiceProviderProfilePolicy;
        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
    }

    public function test_a_service_provider_sees_his_own_profile(): void
    {
        // Première branche, court-circuit : le prestataire se voit lui-même
        // sans qu'aucune collaboration ne soit requise.
        $user = User::factory()->create();
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $user->id]);

        $this->assertTrue($this->policy->view($user->fresh(), $profile));
    }

    public function test_a_user_without_any_profile_sees_nothing(): void
    {
        $profile = $this->providerCollaboratingWith($this->agencyA);

        $this->assertFalse($this->policy->view(User::factory()->create(), $profile));
    }

    public function test_agency_staff_see_a_provider_who_collaborates_with_their_agency(): void
    {
        $profile = $this->providerCollaboratingWith($this->agencyA);

        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyA), $profile));
        $this->assertTrue($this->policy->view($this->agentAt($this->agencyA), $profile));
    }

    public function test_agency_staff_never_see_a_provider_who_collaborates_only_with_another_agency(): void
    {
        // Le cœur du fichier : l'acteur est bien du personnel d'agence, mais
        // le prestataire ne travaille pas pour lui. Tarifs horaires, zones
        // d'intervention et numéro de police d'assurance sont le carnet
        // d'adresses d'un concurrent.
        $profile = $this->providerCollaboratingWith($this->agencyB);

        $this->assertFalse($this->policy->view($this->agencyAdminAt($this->agencyA), $profile));
        $this->assertFalse($this->policy->view($this->agentAt($this->agencyA), $profile));
    }

    public function test_agency_staff_never_see_a_provider_without_any_collaboration(): void
    {
        $orphan = ServiceProviderProfile::factory()->create();

        $this->assertFalse($this->policy->view($this->agencyAdminAt($this->agencyA), $orphan));
    }

    public function test_an_owner_of_the_agency_is_not_staff_enough_to_see_a_provider(): void
    {
        // Le témoin qui distingue « membre de l'agence » de « personnel » :
        // le bailleur appartient à A et la collaboration existe bien avec A,
        // et il doit pourtant être refusé.
        $profile = $this->providerCollaboratingWith($this->agencyA);

        $this->assertFalse($this->policy->view($this->ownerAt($this->agencyA), $profile));
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function providerCollaboratingWith(Agency $agency): ServiceProviderProfile
    {
        $profile = ServiceProviderProfile::factory()->create();

        ServiceProviderAgencyCollaboration::create([
            'service_provider_profile_id' => $profile->id,
            'agency_id' => $agency->id,
            'status' => CollaborationStatus::Active,
            'started_at' => now()->toDateString(),
        ]);

        return $profile->fresh();
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
