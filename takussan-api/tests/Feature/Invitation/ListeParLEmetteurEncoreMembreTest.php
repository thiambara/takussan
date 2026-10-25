<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P233.02 (TCK-2243) — `InvitationController::visibleScope` : pour qui ne passe pas `viewAny`, la
 * liste rend les invitations émises par l'appelant si elles sont sans agence ou s'il est encore
 * membre de leur agence. C'est la forme SQL de la branche émetteur d'`InvitationPolicy::view`
 * depuis TCK-2194 (ADR-0031, amendement du 2026-10-24, B.2).
 *
 * Avant : l'agent suspendu ou retiré, à qui `GET /api/invitations/{id}` répond 403, retrouvait
 * l'invitation, adresse de l'invité comprise, dans `GET /api/invitations`.
 */
class ListeParLEmetteurEncoreMembreTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function invitationEmisePar(User $emetteur, ?int $agencyId): Invitation
    {
        return Invitation::query()->create([
            'token' => Str::random(64),
            'email' => 'invite@example.test',
            'invited_by' => $emetteur->id,
            'invitable_type' => AgentProfile::class,
            'agency_id' => $agencyId,
            'role' => 'agent',
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDays(7),
        ]);
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        return collect($this->actingAsApi($user->fresh())->getJson('/api/invitations')->assertOk()->json('data'))
            ->pluck('id')->all();
    }

    public function test_l_agent_suspendu_ne_liste_plus_l_invitation_qu_il_a_emise(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invitation = $this->invitationEmisePar($agent, $agency->id);

        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->assertFalse($agent->fresh()->can('view', $invitation), 'prémisse : la policy refuse');
        $this->assertNotContains($invitation->id, $this->listeDe($agent), 'invitation listée à l\'émetteur suspendu');
    }

    public function test_l_agent_retire_ne_liste_plus_l_invitation_qu_il_a_emise(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invitation = $this->invitationEmisePar($agent, $agency->id);

        AgentProfile::query()->where('user_id', $agent->id)->delete();

        $this->assertFalse($agent->fresh()->can('view', $invitation), 'prémisse : la policy refuse');
        $this->assertNotContains($invitation->id, $this->listeDe($agent), 'invitation listée à l\'émetteur retiré');
    }

    public function test_temoin_l_agent_actif_liste_l_invitation_qu_il_a_emise(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invitation = $this->invitationEmisePar($agent, $agency->id);

        $this->assertContains($invitation->id, $this->listeDe($agent));
    }

    public function test_temoin_l_emetteur_liste_son_invitation_sans_agence(): void
    {
        $emetteur = User::factory()->create();
        $invitation = $this->invitationEmisePar($emetteur, null);

        $this->assertContains($invitation->id, $this->listeDe($emetteur));
    }
}
