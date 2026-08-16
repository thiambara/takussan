<?php

namespace Tests\Unit\Policies;

use App\Models\Agency;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Policies\InvitationPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-285 — `InvitationPolicy::viewAny` (0/1) et `::view` (0/4) : deux
 * méthodes de LECTURE jamais exécutées par la suite. Une invitation porte
 * l'e-mail d'un tiers et le jeton qui ouvre un compte dans l'agence : les
 * lire, c'est déjà trop quand on n'est pas du bon côté de la frontière.
 *
 * La policy est instanciée DIRECTEMENT, sans passer par `$user->can()` :
 * le bypass global `Gate::before(… isSuperAdmin() …)` ne s'applique donc
 * pas ici, et c'est bien la logique de la policy qu'on mesure, pas celle
 * du pont super-admin.
 *
 * ⚠ Tous les acteurs de ce fichier sont MONO-AGENCE, délibérément.
 * `$user->agency_id` n'est plus une colonne mais un accesseur dérivé du
 * profil actif (TCK-142) : hors requête HTTP, il ne se résout que par
 * l'auto-bascule « un seul profil, une seule agence ». Le cas multi-agences
 * est figé explicitement par
 * {@see test_a_multi_agency_admin_falls_back_to_a_refusal}.
 */
class InvitationPolicyTest extends TestCase
{
    use RefreshDatabase;

    private InvitationPolicy $policy;

    private Agency $agencyA;

    private Agency $agencyB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->policy = new InvitationPolicy;
        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();
    }

    // ─── viewAny ─────────────────────────────────────────────────

    public function test_an_agency_admin_can_list_invitations(): void
    {
        $this->assertTrue($this->policy->viewAny($this->agencyAdminAt($this->agencyA)));
    }

    public function test_an_agent_cannot_list_invitations(): void
    {
        // Le témoin qui distingue « membre de l'agence » de « admin de
        // l'agence » : un agent appartient bien à A, et doit pourtant être
        // refusé. Sans lui, une policy qui ne vérifierait que l'appartenance
        // resterait verte.
        $this->assertFalse($this->policy->viewAny($this->agentAt($this->agencyA)));
    }

    public function test_a_user_without_any_profile_cannot_list_invitations(): void
    {
        $this->assertFalse($this->policy->viewAny(User::factory()->create()));
    }

    public function test_a_multi_agency_admin_falls_back_to_a_refusal(): void
    {
        // Comportement MESURÉ, pas souhaité : `agency_id` rend null dès que
        // l'utilisateur détient des profils dans deux agences (garde-fou de
        // TCK-142), donc `viewAny` refuse — alors même que l'acteur est
        // agency admin des deux. Hors requête HTTP il n'y a pas de
        // `ResolveActiveProfile` pour trancher. Ce test fige le fait ; le
        // corriger demanderait de passer l'agence en argument, ce qui est
        // un changement d'API, pas un test.
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agencyA->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $this->agencyB->id]);

        $this->assertNull($user->fresh()->agency_id);
        $this->assertFalse($this->policy->viewAny($user->fresh()));
    }

    // ─── view ────────────────────────────────────────────────────

    public function test_an_agency_admin_sees_an_invitation_of_his_own_agency(): void
    {
        $invitation = Invitation::factory()->create(['agency_id' => $this->agencyA->id]);

        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyA), $invitation));
    }

    public function test_an_agency_admin_never_sees_an_invitation_of_another_agency(): void
    {
        // La fuite inter-tenant : l'e-mail de l'invité et le jeton
        // d'acceptation appartiennent à l'agence B.
        $invitation = Invitation::factory()->create(['agency_id' => $this->agencyB->id]);

        $this->assertFalse($this->policy->view($this->agencyAdminAt($this->agencyA), $invitation));
    }

    public function test_an_agency_admin_sees_an_invitation_without_any_agency(): void
    {
        // Intention MESURÉE et figée telle quelle : une invitation dont
        // `agency_id` est NULL (invitation plateforme, hors agence) est
        // visible par TOUT agency admin, quelle que soit son agence. Ce n'est
        // pas un oubli de portée — c'est la branche explicite
        // `$invitation->agency_id === null ||` de la policy. Le test la fige
        // pour qu'un futur resserrement soit une DÉCISION et non un effet de
        // bord ; il ne la valide pas.
        $invitation = Invitation::factory()->create(['agency_id' => null]);

        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyA), $invitation));
        $this->assertTrue($this->policy->view($this->agencyAdminAt($this->agencyB), $invitation));
    }

    public function test_a_non_admin_sees_the_invitation_he_emitted(): void
    {
        $agent = $this->agentAt($this->agencyA);
        $invitation = Invitation::factory()->create([
            'agency_id' => $this->agencyA->id,
            'invited_by' => $agent->id,
        ]);

        $this->assertTrue($this->policy->view($agent, $invitation));
    }

    public function test_a_non_admin_never_sees_an_invitation_emitted_by_someone_else(): void
    {
        // Même agence, mais émise par un collègue : la branche non-admin est
        // strictement personnelle, pas « au niveau de l'agence ».
        $agent = $this->agentAt($this->agencyA);
        $invitation = Invitation::factory()->create([
            'agency_id' => $this->agencyA->id,
            'invited_by' => User::factory()->create()->id,
        ]);

        $this->assertFalse($this->policy->view($agent, $invitation));
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
}
