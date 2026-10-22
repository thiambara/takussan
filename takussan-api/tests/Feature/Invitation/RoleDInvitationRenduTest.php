<?php

namespace Tests\Feature\Invitation;

use App\Http\Requests\Invitation\CreateInvitationRequest;
use App\Mail\InvitationMailable;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationAcceptedNotification;
use App\Services\Invitation\AgentInvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Lang;
use Illuminate\Validation\Rules\In;
use Tests\TestCase;

/**
 * P155.01 (TCK-1437) — le courriel d'invitation et l'avis d'acceptation nomment le rôle, pour
 * chaque rôle qu'une invitation accepte, dans les trois langues. `agent_senior` et `agent_manager`
 * (`AgentInvitationService::ALLOWED_ROLES`) rendaient la clé brute `invitations.roles.agent_senior`.
 */
class RoleDInvitationRenduTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Les rôles des deux émetteurs, lus à leur source : un rôle ajouté à l'un d'eux entre ici seul.
     *
     * @return list<string>
     */
    private function rolesAcceptes(): array
    {
        $regle = collect((new CreateInvitationRequest)->rules()['role'])->first(fn ($r) => $r instanceof In);
        $this->assertNotNull($regle, 'CreateInvitationRequest ne borne plus `role` par Rule::in.');
        preg_match_all('/"([a-z_]+)"/', (string) $regle, $m);

        $roles = array_values(array_unique([...$m[1], ...AgentInvitationService::ALLOWED_ROLES]));
        $this->assertContains('owner', $roles);
        $this->assertContains('agent_manager', $roles);

        return $roles;
    }

    public function test_chaque_role_accepte_est_nomme_dans_le_courriel_et_l_avis(): void
    {
        $destinataire = User::factory()->create();

        foreach (['fr', 'en', 'wo'] as $langue) {
            App::setLocale($langue);
            foreach ($this->rolesAcceptes() as $role) {
                // Une clé absente d'une langue retombe sur la langue de secours sans clé brute :
                // le rendu seul ne le verrait pas.
                $this->assertTrue(Lang::hasForLocale("invitations.roles.{$role}", $langue), "invitations.roles.{$role} absent en {$langue}");
                $invitation = Invitation::factory()->create(['role' => $role]);

                $courriel = (new InvitationMailable($invitation))->render();
                $avis = (string) (new InvitationAcceptedNotification($invitation))->toMail($destinataire)->render();

                $this->assertStringNotContainsString('invitations.roles.', $courriel, "courriel, rôle {$role}, langue {$langue}");
                $this->assertStringNotContainsString('invitations.roles.', $avis, "avis, rôle {$role}, langue {$langue}");
            }
        }
    }
}
