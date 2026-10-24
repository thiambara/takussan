<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1748 (P116.03) — les invitations de l'agence se jugent par `team.invite`, admin compris,
 * comme `AgencyPolicy::updateKyc` : la liste, la lecture, la création, la révocation et la
 * relance. Seul l'admin principal garde le geste sans la capacité.
 *
 * Avant : la liste, la lecture et la création jugeaient le type de profil admin, la révocation la
 * capacité. Un admin dont le rôle retire `team.invite` listait, créait et révoquait ; un agent qui
 * la tient révoquait une invitation qu'il ne pouvait pas lister (`GET /api/invitations` → `[]`).
 */
class InvitationJugeeParTeamInviteTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Invitation $invitation;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $this->agency = Agency::factory()->create();
        $emetteur = $this->agencyAdmin($this->agency);
        $this->invitation = Invitation::query()->create([
            'token' => Str::random(64),
            'email' => 'invite@example.test',
            'invited_by' => $emetteur->id,
            'invitable_type' => AgentProfile::class,
            'agency_id' => $this->agency->id,
            'role' => 'agent',
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDays(7),
        ]);
    }

    /** @return list<int> */
    private function idsListes(User $user): array
    {
        return collect($this->actingAsApi($user)->getJson('/api/invitations')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function test_un_agent_qui_tient_team_invite_liste_lit_et_relance_les_invitations_de_l_agence(): void
    {
        $agent = $this->agentWith($this->agency, Capability::TeamInvite);

        $this->assertSame([$this->invitation->id], $this->idsListes($agent));
        $this->actingAsApi($agent)->getJson("/api/invitations/{$this->invitation->id}")->assertOk();
        $this->assertTrue($agent->can('create', Invitation::class));
        $this->actingAsApi($agent)->postJson("/api/invitations/{$this->invitation->id}/resend")->assertOk();
    }

    public function test_un_admin_sans_team_invite_ne_liste_ni_ne_cree_ni_ne_revoque(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::TeamInvite);

        $this->assertSame([], $this->idsListes($admin));
        $this->actingAsApi($admin)->getJson("/api/invitations/{$this->invitation->id}")->assertForbidden();
        $this->assertFalse($admin->can('create', Invitation::class));
        $this->actingAsApi($admin)->postJson("/api/invitations/{$this->invitation->id}/revoke")->assertForbidden();
        $this->actingAsApi($admin)->postJson("/api/invitations/{$this->invitation->id}/resend")->assertForbidden();

        $this->assertSame(InvitationStatus::Sent->value, $this->invitation->refresh()->status->value);
    }

    public function test_un_agent_du_role_systeme_ne_liste_pas(): void
    {
        $agent = $this->agencyAgent($this->agency);

        $this->assertSame([], $this->idsListes($agent));
        $this->assertFalse($agent->can('create', Invitation::class));
        $this->actingAsApi($agent)->postJson("/api/invitations/{$this->invitation->id}/revoke")->assertForbidden();
    }

    public function test_l_admin_du_role_systeme_et_l_admin_principal_gardent_le_geste(): void
    {
        $this->assertSame([$this->invitation->id], $this->idsListes($this->agencyAdmin($this->agency)));

        $principal = $this->adminWithout($this->agency, Capability::TeamInvite);
        $this->agency->forceFill(['primary_admin_id' => $principal->id])->save();

        $this->assertSame([$this->invitation->id], $this->idsListes($principal));
        $this->assertTrue($principal->can('create', Invitation::class));
        $this->actingAsApi($principal)->postJson("/api/invitations/{$this->invitation->id}/revoke")->assertOk();
    }

    public function test_le_personnel_d_une_autre_agence_ne_voit_rien(): void
    {
        $autre = $this->agentWith(Agency::factory()->create(), Capability::TeamInvite);

        $this->assertSame([], $this->idsListes($autre));
        $this->actingAsApi($autre)->getJson("/api/invitations/{$this->invitation->id}")->assertForbidden();
        $this->actingAsApi($autre)->postJson("/api/invitations/{$this->invitation->id}/revoke")->assertForbidden();
    }
}
