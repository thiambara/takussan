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
 * P218.05 (TCK-2194) — `InvitationPolicy::view` : l'émetteur lit son invitation si elle est sans
 * agence ou s'il est encore membre de son agence (`isMemberAt`), comme `revoke` et `resend`
 * depuis TCK-429 (décision du porteur du 2026-10-24).
 *
 * Avant : l'agent suspendu ou retiré lisait l'invitation qu'il avait émise, adresse de l'invité
 * comprise (`GET /api/invitations/{id}` → 200).
 *
 * P233.02 (TCK-2243, ex-`ListeParLEmetteurEncoreMembreTest`, versé par TCK-3017) — la liste suit la même règle
 * (`InvitationController::visibleScope`, forme SQL de la branche émetteur de la policy) : chaque cas lit ET liste.
 */
class LectureParLEmetteurEncoreMembreTest extends ApiTestCase
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

    public function test_l_agent_suspendu_ne_lit_ni_ne_liste_plus_l_invitation_qu_il_a_emise(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invitation = $this->invitationEmisePar($agent, $agency->id);

        AgentProfile::query()->where('user_id', $agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->actingAsApi($agent->fresh())->getJson("/api/invitations/{$invitation->id}")->assertForbidden();
        $this->assertNotContains($invitation->id, $this->listeDe($agent), 'invitation listée à l\'émetteur suspendu');
    }

    public function test_l_agent_retire_ne_lit_ni_ne_liste_plus_l_invitation_qu_il_a_emise(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invitation = $this->invitationEmisePar($agent, $agency->id);

        AgentProfile::query()->where('user_id', $agent->id)->delete();

        $this->actingAsApi($agent->fresh())->getJson("/api/invitations/{$invitation->id}")->assertForbidden();
        $this->assertNotContains($invitation->id, $this->listeDe($agent), 'invitation listée à l\'émetteur retiré');
    }

    public function test_temoin_l_agent_actif_lit_et_liste_l_invitation_qu_il_a_emise(): void
    {
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $invitation = $this->invitationEmisePar($agent, $agency->id);

        $this->actingAsApi($agent)->getJson("/api/invitations/{$invitation->id}")->assertOk();
        $this->assertContains($invitation->id, $this->listeDe($agent));
    }

    public function test_temoin_l_emetteur_lit_et_liste_son_invitation_sans_agence(): void
    {
        $emetteur = User::factory()->create();
        $invitation = $this->invitationEmisePar($emetteur, null);

        $this->actingAsApi($emetteur)->getJson("/api/invitations/{$invitation->id}")->assertOk();
        $this->assertContains($invitation->id, $this->listeDe($emetteur));
    }
}
