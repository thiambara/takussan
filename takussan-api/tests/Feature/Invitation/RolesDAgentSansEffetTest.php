<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Invitation\AgentInvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P234.01 (TCK-2280) — le rôle choisi à l'invitation d'un agent (`agent_senior`, `agent_manager`)
 * n'était jamais appliqué : `metadata.invited_role` n'avait aucun lecteur, et le membre entrait avec
 * le rôle système « Agent ». Décision du porteur : ne plus les offrir, les invitations déjà émises
 * restant acceptées.
 */
class RolesDAgentSansEffetTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-2365 (P242.01) — `agency_admin` y entre : un compte existant rejoint l'équipe par
     * l'invitation, au rôle agent ou administrateur. Les deux rôles sans effet n'y reviennent pas.
     */
    public function test_l_invitation_d_un_agent_n_offre_que_le_role_agent(): void
    {
        $this->assertSame(['agent', 'agency_admin'], AgentInvitationService::ALLOWED_ROLES);
    }

    /** @return array<string, array{string}> */
    public static function rolesDejaEmis(): array
    {
        return ['agent_senior' => ['agent_senior'], 'agent_manager' => ['agent_manager']];
    }

    #[DataProvider('rolesDejaEmis')]
    public function test_une_invitation_deja_emise_sous_un_role_retire_s_accepte_toujours(string $role): void
    {
        Mail::fake();
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $brouillon = AgentProfile::factory()->create([
            'user_id' => null,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Draft->value,
            'metadata' => ['invited_role' => $role],
        ]);
        $invitation = Invitation::factory()->create([
            'email' => "{$role}@example.com",
            'role' => $role,
            'agency_id' => $agency->id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $brouillon->id,
        ]);

        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'password' => 'Un-mot-de-passe-1',
        ])->assertOk()->assertJsonPath('data.status', InvitationStatus::Accepted->value);

        $compte = User::query()->where('email', "{$role}@example.com")->sole();
        $brouillon->refresh();
        $this->assertSame($compte->id, $brouillon->user_id);
        $this->assertSame(AgentProfileStatus::Active, $brouillon->status);
    }
}
