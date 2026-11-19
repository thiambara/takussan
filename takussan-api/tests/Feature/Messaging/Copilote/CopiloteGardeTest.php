<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Ai\Agents\FilResume;
use App\Models\AgencyRole;
use App\Models\AiCall;
use App\Models\Conversation;
use App\Models\Enums\Capability;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2974 (ADR-0131 § 1, AC1) — la matrice de non-fuite : seul le personnel ACTIF de l'agence du fil, qui y
 * participe et le lit, et qui tient `messaging.copilot`, a le copilote. Tout autre lecteur reçoit 403
 * `copilote.indisponible`, avant tout appel, sans ligne `ai_calls`.
 */
class CopiloteGardeTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    private int $depuis;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
        $this->depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
    }

    public function test_l_agent_participant_obtient_son_resume(): void
    {
        $this->demanderUnResume($this->auteur, $this->depuis)->assertStatus(202);

        $this->assertSame(1, AiCall::query()->count());
        $this->etatDuCopilote($this->auteur)->assertOk()->assertJsonPath('data.sortes.resume.statut', 'prete');
    }

    public function test_l_administrateur_de_l_agence_participant_obtient_son_resume(): void
    {
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->agence->id]);
        $this->fil->participants()->attach($admin->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        $this->demanderUnResume($admin, $this->depuis)->assertStatus(202);
        $this->assertSame(1, AiCall::query()->count());
    }

    public function test_un_collegue_qui_ne_participe_pas_est_refuse(): void
    {
        $this->refuse($this->agentDeLAgence($this->agence));
    }

    public function test_un_agent_d_une_autre_agence_participant_est_refuse(): void
    {
        $this->refuse($this->agentAilleurs);
    }

    public function test_le_bailleur_est_refuse(): void
    {
        $this->refuse($this->bailleur);
    }

    public function test_le_bailleur_a_qui_l_agence_accorde_la_capacite_reste_refuse(): void
    {
        $role = AgencyRole::query()->create([
            'agency_id' => $this->agence->id, 'name' => 'Bailleur assisté', 'base_profile_type' => 'owner',
            'is_system' => false, 'is_clonable' => true,
        ]);
        app(AgencyRoleService::class)->replaceCapabilities($role, [Capability::MessagingCopilot]);
        OwnerProfile::query()->where('user_id', $this->bailleur->id)->where('agency_id', $this->agence->id)
            ->update(['agency_role_id' => $role->id]);
        // Le témoin : la capacité lui est bien accordée ; seule la clause du personnel le refuse.
        $this->assertTrue($this->bailleur->fresh()->canActAt(Capability::MessagingCopilot, $this->agence));

        $this->refuse($this->bailleur->fresh());
    }

    public function test_le_locataire_est_refuse(): void
    {
        $this->refuse($this->locataire);
    }

    public function test_un_prestataire_participant_est_refuse(): void
    {
        $prestataire = ServiceProviderProfile::factory()->create()->user;
        $this->fil->participants()->attach($prestataire->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        $this->refuse($prestataire);
    }

    public function test_le_super_admin_participant_est_refuse(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        $this->fil->participants()->attach($operateur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        $this->refuse($operateur);
    }

    public function test_un_fil_sans_agence_n_a_pas_de_copilote(): void
    {
        $collegue = $this->collegue;
        $direct = Conversation::create([
            'type' => ConversationType::Direct->value, 'status' => ConversationStatus::Active->value, 'created_by' => $this->auteur->id,
        ]);
        foreach ([$this->auteur, $collegue] as $membre) {
            $direct->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        }
        $depuis = $this->ecrireDesMessages(12, $collegue, $direct)->id;

        $this->demanderUnResume($this->auteur, $depuis, $direct)->assertForbidden()->assertJsonPath('code', 'copilote.indisponible');
        $this->assertSame(0, AiCall::query()->count());
    }

    private function refuse(User $lecteur): void
    {
        $this->demanderUnResume($lecteur, $this->depuis)->assertForbidden()->assertJsonPath('code', 'copilote.indisponible');
        $this->etatDuCopilote($lecteur)->assertForbidden()->assertJsonPath('code', 'copilote.indisponible');

        $this->assertSame(0, AiCall::query()->count());
        FilResume::assertNeverPrompted();
    }
}
