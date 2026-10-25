<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\AgencySystemRoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2365 (P242.01, P242.02, P242.03, P251.01 ; ADR-0031, amendement du 2026-10-25) — un compte
 * existant n'entre dans l'équipe que par l'invitation : profil brouillon, lien, acceptation par le
 * compte, au rôle agent ou administrateur.
 *
 * Avant : `POST /api/agencies/{id}/members` (et son alias `…/agents`) faisait d'un compte
 * quelconque, désigné par son e-mail, un agent actif, sans accord ni avis, et rendait ses
 * coordonnées ; un membre retiré y revenait avec son ancien rôle personnalisé. Réinviter un agent
 * retiré rendait 500 à l'acceptation (`unique(user_id, agency_id)`).
 */
class RattachementParInvitationTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
        $this->agency = Agency::factory()->create();
    }

    private function inviter(User $admin, User $cible, string $role): TestResponse
    {
        return $this->actingAsApi($admin)->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
            'email' => $cible->email,
            'role' => $role,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ]);
    }

    private function accepter(User $compte): TestResponse
    {
        $invitation = Invitation::query()->latest('id')->firstOrFail();

        return $this->actingAsApi($compte)->postJson("/api/invitations/{$invitation->token}/accept", []);
    }

    private function roleSysteme(AgencyRoleBaseType $type): int
    {
        return (int) app(AgencySystemRoleSeeder::class)->systemRoleFor((int) $this->agency->id, $type)->id;
    }

    public function test_le_rattachement_direct_n_est_plus_enregistre(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->flatMap(fn ($r) => array_map(fn (string $m) => $m.' '.$r->uri(), $r->methods()))
            ->all();

        $this->assertNotContains('POST api/agencies/{agency}/members', $routes);
        $this->assertNotContains('POST api/agencies/{agency}/agents', $routes);
        $this->assertContains('GET api/agencies/{agency}/members', $routes, 'la liste reste');
        $this->assertContains('POST api/agencies/{agency}/agents/invite', $routes, "l'invitation reste");
    }

    public function test_un_admin_ne_rattache_plus_un_compte_directement(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $cible = User::factory()->withOwnerProfile(Agency::factory()->create())->create();

        // 405 : `GET …/members` (la liste) garde ce chemin.
        $this->actingAsApi($admin)
            ->postJson("/api/agencies/{$this->agency->id}/members", ['email' => $cible->email])
            ->assertStatus(405);
        $this->actingAsApi($admin)
            ->postJson("/api/agencies/{$this->agency->id}/agents", ['user_id' => $cible->id])
            ->assertNotFound();

        $this->assertFalse($cible->fresh()->isAgentAt((int) $this->agency->id));
        $this->assertSame(0, AgentProfile::withTrashed()->where('user_id', $cible->id)->count());
    }

    public function test_inviter_un_compte_existant_comme_administrateur_n_active_rien_avant_l_acceptation(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $cible = User::factory()->create();

        $this->inviter($admin, $cible, 'agency_admin')
            ->assertCreated()
            ->assertJsonPath('data.role', 'agency_admin');

        $invitation = Invitation::query()->sole();
        $this->assertSame(AgentProfile::class, $invitation->invitable_type);
        $this->assertSame($cible->id, $invitation->invited_user_id);
        $brouillon = AgentProfile::query()->findOrFail($invitation->invitable_id);
        $this->assertSame(AgentProfileStatus::Draft, $brouillon->status);
        $this->assertNull($brouillon->user_id);
        $this->assertFalse($cible->fresh()->isAgentAt((int) $this->agency->id));
        $this->assertFalse($cible->fresh()->isAgencyAdminAt((int) $this->agency->id));

        $this->accepter($cible)->assertOk();

        $this->assertTrue($cible->fresh()->isAgentAt((int) $this->agency->id));
        $this->assertTrue($cible->fresh()->isAgencyAdminAt((int) $this->agency->id));
        $this->assertSame(
            $this->roleSysteme(AgencyRoleBaseType::AgencyAdmin),
            (int) AgencyAdminProfile::query()->where('user_id', $cible->id)->value('agency_role_id'),
        );
        $this->assertSame(InvitationStatus::Accepted, $invitation->fresh()->status);
    }

    public function test_inviter_comme_administrateur_exige_team_assign_role(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::TeamAssignRole);
        $cible = User::factory()->create();

        $this->inviter($admin, $cible, 'agency_admin')->assertForbidden();
        $this->assertSame(0, Invitation::query()->count());
        $this->assertSame(0, AgentProfile::query()->where('agency_id', $this->agency->id)->whereNull('user_id')->count());

        // Inviter comme agent ne confère aucun rôle d'administration : il reste ouvert.
        $this->inviter($admin, $cible, 'agent')->assertCreated();
    }

    public function test_l_admin_principal_invite_un_administrateur_sans_la_capacite(): void
    {
        $principal = $this->adminWithout($this->agency, Capability::TeamAssignRole);
        $this->agency->update(['primary_admin_id' => $principal->id]);

        $this->inviter($principal, User::factory()->create(), 'agency_admin')->assertCreated();
    }

    /**
     * P242.03 et P251.01 — l'invitation ne dit rien de l'existence du compte : une adresse connue,
     * en casse mixte, et une adresse inconnue rendent la même réponse, sans `invited_user_id`.
     * L'invitation trouve pourtant le compte, adresse repliée (l'acceptation lui revient).
     */
    public function test_l_invitation_ne_dit_rien_de_l_existence_du_compte(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $connu = User::factory()->create(['email' => 'awa.diop@example.test']);
        $inviter = fn (string $email) => $this->actingAsApi($admin)->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
            'email' => $email, 'role' => 'agent', 'first_name' => 'Awa', 'last_name' => 'Diop',
        ]);

        $pourLeConnu = $inviter('Awa.Diop@Example.test')->assertCreated();
        $pourLInconnu = $inviter('inconnu@example.test')->assertCreated();

        $this->assertNull($pourLeConnu->json('data.invited_user_id'));
        $this->assertNull($pourLInconnu->json('data.invited_user_id'));
        $this->assertSame(
            array_keys($pourLeConnu->json('data')),
            array_keys($pourLInconnu->json('data')),
        );
        $this->assertSame($connu->id, (int) Invitation::query()->where('email', 'awa.diop@example.test')->value('invited_user_id'));
    }

    /**
     * P242.02 — le membre retiré puis réinvité revient au rôle système demandé, jamais à son
     * ancien rôle personnalisé ; et l'acceptation aboutit (500 avant : la ligne retirée tient
     * encore `unique(user_id, agency_id)`).
     */
    public function test_un_agent_retire_puis_reinvite_revient_au_role_systeme(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $membre = $this->agentWith($this->agency, Capability::TeamAssignRole, Capability::PayoutsApprove);
        $ancien = AgentProfile::query()->where('user_id', $membre->id)->sole();
        app(AgencyMemberRemovalService::class)->remove($this->agency, $membre, $admin, true);
        $this->assertFalse($membre->fresh()->isAgentAt((int) $this->agency->id));

        $this->inviter($admin, $membre, 'agent')->assertCreated();
        $this->accepter($membre)->assertOk();

        $profil = AgentProfile::query()->where('user_id', $membre->id)->where('agency_id', $this->agency->id)->sole();
        $this->assertSame($ancien->id, $profil->id, 'la ligne retirée est reprise, avec son historique');
        $this->assertSame(AgentProfileStatus::Active, $profil->status);
        $this->assertSame($this->roleSysteme(AgencyRoleBaseType::Agent), (int) $profil->agency_role_id);
        $this->assertFalse($membre->fresh()->canActAt(Capability::TeamAssignRole, $this->agency));
        $this->assertFalse($membre->fresh()->canActAt(Capability::PayoutsApprove, $this->agency));

        $invitation = Invitation::query()->latest('id')->firstOrFail();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);
        $this->assertSame($profil->id, (int) $invitation->invitable_id);
        $this->assertSame(0, AgentProfile::query()->where('agency_id', $this->agency->id)->whereNull('user_id')->count());
    }

    /** P242.02 — le changement de rôle qui restaure un profil retiré lui rend le rôle système. */
    public function test_le_changement_de_role_restaure_au_role_systeme(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $membre = $this->agentWith($this->agency, Capability::PayoutsApprove);

        $this->actingAsApi($admin)
            ->putJson("/api/agencies/{$this->agency->id}/members/{$membre->id}/role", ['role' => 'owner'])
            ->assertOk();
        $this->actingAsApi($admin)
            ->putJson("/api/agencies/{$this->agency->id}/members/{$membre->id}/role", ['role' => 'agent'])
            ->assertOk();

        $profil = AgentProfile::query()->where('user_id', $membre->id)->sole();
        $this->assertSame($this->roleSysteme(AgencyRoleBaseType::Agent), (int) $profil->agency_role_id);
        $this->assertFalse($membre->fresh()->canActAt(Capability::PayoutsApprove, $this->agency));
        $this->assertSame(0, OwnerProfile::query()->where('user_id', $membre->id)->count());
    }
}
