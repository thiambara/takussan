<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\OperateursPlateforme;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 § 3, décision 2 « a + b », AC2) — déclarer tenu : le porteur, le bénéficiaire et le
 * personnel ; tout autre participant est refusé. Tenu après l'échéance, `overdue_at` est posé.
 *
 * Scène : le locataire porte la promesse, faite au voisin ; l'agent est le personnel ; `tiers` participe
 * au fil sans être ni partie ni personnel.
 */
class DeclarerTenuTest extends TestCase
{
    use MaintenanceActors, OperateursPlateforme, RefreshDatabase, SceneDEngagement;

    private User $tiers;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        $this->tiers = User::factory()->create();
        $this->fil->participants()->attach($this->tiers->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ouvert(array $attributs = []): Commitment
    {
        return $this->engagement($attributs + [
            'status' => CommitmentStatus::Open,
            'beneficiary_id' => $this->voisin->id,
            'due_at' => now()->addDays(2),
        ]);
    }

    private function tenir(Commitment $engagement, User $acteur): TestResponse
    {
        Sanctum::actingAs($acteur);

        return $this->postJson("/api/commitments/{$engagement->id}/kept");
    }

    public function test_le_porteur_declare_tenu(): void
    {
        $engagement = $this->ouvert();

        $this->tenir($engagement, $this->locataire)->assertOk()
            ->assertJsonPath('data.status', 'kept')->assertJsonPath('data.abilities.keep', false);

        $engagement->refresh();
        $this->assertSame(CommitmentStatus::Kept, $engagement->status);
        $this->assertSame($this->locataire->id, (int) $engagement->kept_by_id);
        $this->assertNotNull($engagement->kept_at);
        $this->assertNull($engagement->overdue_at, 'Tenu avant l\'échéance : aucun retard.');

        $evenement = Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)->latest('id')->firstOrFail();
        $this->assertSame('commitment.kept', $evenement->metadata['code']);
        $this->assertEquals(['type' => 'commitment', 'id' => $engagement->id], $evenement->metadata['object']);
        $this->assertSame([], $evenement->metadata['action_for']);
    }

    public function test_le_beneficiaire_declare_tenu(): void
    {
        $engagement = $this->ouvert();

        $this->tenir($engagement, $this->voisin)->assertOk();

        $this->assertSame($this->voisin->id, (int) $engagement->refresh()->kept_by_id);
        $this->assertSame(CommitmentStatus::Kept, $engagement->status);
    }

    public function test_le_personnel_declare_tenu(): void
    {
        $engagement = $this->ouvert();

        $this->tenir($engagement, $this->agent)->assertOk();

        $this->assertSame($this->agent->id, (int) $engagement->refresh()->kept_by_id);
    }

    public function test_un_participant_hors_des_parties_et_du_personnel_est_refuse(): void
    {
        $engagement = $this->ouvert();

        $this->tenir($engagement, $this->tiers)->assertForbidden();
        $this->tenir($engagement, $this->etranger)->assertForbidden();
        $this->assertSame(CommitmentStatus::Open, $engagement->refresh()->status);

        // La projection le dit au lecteur : aucun geste « tenu » pour lui.
        Sanctum::actingAs($this->tiers);
        $ligne = collect($this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data'))->firstWhere('id', $engagement->id);
        $this->assertFalse($ligne['abilities']['keep']);
        Sanctum::actingAs($this->voisin);
        $ligne = collect($this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data'))->firstWhere('id', $engagement->id);
        $this->assertTrue($ligne['abilities']['keep']);
    }

    public function test_tenu_apres_l_echeance_pose_overdue_at(): void
    {
        $engagement = $this->ouvert(['due_at' => now()->addHour()]);
        $echeance = $engagement->due_at->copy();
        Carbon::setTestNow(now()->addHours(3));

        $this->tenir($engagement, $this->locataire)->assertOk();

        $engagement->refresh();
        $this->assertNotNull($engagement->overdue_at, 'Tenu en retard, avant même la commande : le retard compte.');
        $this->assertTrue($echeance->equalTo($engagement->overdue_at));
    }

    public function test_un_overdue_at_deja_pose_n_est_pas_reecrit(): void
    {
        $engagement = $this->ouvert(['due_at' => now()->subHours(2), 'overdue_at' => now()->subDays(5)]);
        $historique = $engagement->overdue_at->copy();

        $this->tenir($engagement, $this->locataire)->assertOk();

        $this->assertTrue($historique->equalTo($engagement->refresh()->overdue_at));
    }

    public function test_un_engagement_qui_n_est_pas_ouvert_ne_se_declare_pas_tenu(): void
    {
        foreach ([CommitmentStatus::Proposed, CommitmentStatus::Kept, CommitmentStatus::Cancelled] as $statut) {
            $engagement = $this->ouvert(['status' => $statut]);
            $this->tenir($engagement, $this->agent)->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
        }
    }

    public function test_le_super_admin_ne_declare_rien(): void
    {
        $engagement = $this->ouvert();
        $superAdmin = $this->operateur(PlatformProfileLevel::SuperAdmin)->fresh();

        $this->tenir($engagement, $superAdmin)->assertForbidden();
        Sanctum::actingAs($superAdmin);
        $this->putJson("/api/commitments/{$engagement->id}", ['title' => 'Autre'])->assertForbidden();
        $this->postJson("/api/commitments/{$engagement->id}/remind")->assertForbidden();
        $this->postJson("/api/commitments/{$engagement->id}/not-yet")->assertForbidden();
        $this->assertSame(CommitmentStatus::Open, $engagement->refresh()->status);
    }
}
