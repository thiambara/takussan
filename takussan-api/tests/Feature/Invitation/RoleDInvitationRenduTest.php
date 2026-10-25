<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationAcceptedNotification;
use App\Services\Invitation\AgentInvitationService;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Lang;
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
     * Les rôles qu'`InvitationService::send()` émet, lus à leur source : un rôle ajouté entre ici
     * seul. P208.01 (TCK-2190) — ils se lisaient sur `CreateInvitationRequest`, partie avec la
     * création générique ; `agency_admin`, qu'elle acceptait et que le service refuse toujours, en
     * sort.
     *
     * @return list<string>
     */
    private function rolesAcceptes(): array
    {
        $roles = array_values(array_unique([
            ...array_keys(InvitationService::INVITABLE_TYPE_BY_ROLE),
            ...InvitationService::ROLES_WITHOUT_INVITABLE,
            ...AgentInvitationService::ALLOWED_ROLES,
        ]));
        $this->assertContains('super_admin', $roles);
        $this->assertContains('service_provider', $roles);
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
